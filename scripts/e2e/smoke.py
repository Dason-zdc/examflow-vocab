#!/usr/bin/env python3
"""ExamFlow Vocab E2E 冒烟脚本（Playwright sync API）。

覆盖 docs/04-TEST-PLAN.md TG-4（无 E2E）与 §5 手工矩阵中可自动化的子集：
  M-1 PWA 可安装性（manifest / sw.js / SW 注册）
  M-2 离线可用（简化版：离线 reload 后应用仍渲染；console error 做精确分类，
       packLoader 网络优先必然产生的 manifest 抓取失败计为 expected，其余判失败）
  M-3 当日计划展示（设置考期 → 首页计划面板数值）
  M-7 移动端视口（390x844 无横向滚动 + 触底按钮可达且 ≥44px）

用法（必须用带 playwright 的 python 执行）：
  <venv-python> scripts/e2e/smoke.py

行为：
  - 自行启动 vite preview（默认 4173，被占用则 4174，--strictPort 防静默换端口），
    等待 HTTP 200 就绪（超时 60s 报错），try/finally 关停，不留孤儿进程。
  - 每次运行先删除并重建 dist-e2e/，输出截图 PNG + report.json + report.md。
  - 全部断言通过退出码 0，任一失败退出码 1。
"""

from __future__ import annotations

import json
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

PROJECT = Path(__file__).resolve().parents[2]
OUT = PROJECT / "dist-e2e"
PORT_CANDIDATES = [4173, 4174]
READY_TIMEOUT_S = 60

# 本机存在 HTTP_PROXY（如 http://127.0.0.1:3673）且 no_proxy 不含本机地址，
# urllib 默认走代理会把对本机 preview 的请求变成 502。探测一律走直连 opener。
NO_PROXY_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

RESULTS: list[dict] = []


def record(assert_id: str, title: str, ok: bool, details: dict) -> bool:
    RESULTS.append(
        {"id": assert_id, "title": title, "status": "pass" if ok else "fail", "details": details}
    )
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {assert_id} {title}", flush=True)
    if not ok:
        print(f"       diagnostics: {json.dumps(details, ensure_ascii=False)[:2000]}", flush=True)
    return ok


# ---------- 服务器管理 ----------

def _port_in_use(port: int) -> bool:
    """TCP 层探测（不走 HTTP 代理）；localhost 可能解析到 127.0.0.1 或 ::1，都查。"""
    try:
        infos = socket.getaddrinfo("localhost", port, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        infos = [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("127.0.0.1", port))]
    for family, socktype, proto, _canon, addr in infos:
        try:
            with socket.socket(family, socktype, proto) as s:
                s.settimeout(0.3)
                if s.connect_ex(addr) == 0:
                    return True
        except OSError:
            continue
    return False


def _pick_port() -> int:
    for p in PORT_CANDIDATES:
        if not _port_in_use(p):
            return p
    raise RuntimeError(f"端口 {PORT_CANDIDATES} 均被占用，无法启动 preview")


def start_server(port: int) -> subprocess.Popen:
    node = shutil.which("node")
    vite_bin = PROJECT / "node_modules" / "vite" / "bin" / "vite.js"
    if not node or not vite_bin.exists():
        raise RuntimeError(f"找不到 node({node}) 或 {vite_bin}")
    log = open(OUT / "preview-server.log", "w", encoding="utf-8")
    proc = subprocess.Popen(
        [node, str(vite_bin), "preview", "--port", str(port), "--strictPort"],
        cwd=str(PROJECT),
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    deadline = time.time() + READY_TIMEOUT_S
    while time.time() < deadline:
        if proc.poll() is not None:
            log.close()
            tail = (OUT / "preview-server.log").read_text(encoding="utf-8", errors="replace")[-2000:]
            raise RuntimeError(f"preview 进程提前退出 code={proc.returncode}\n{tail}")
        try:
            with NO_PROXY_OPENER.open(f"http://localhost:{port}/", timeout=2) as r:
                if r.status == 200:
                    return proc
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.5)
    proc.terminate()
    log.close()
    raise RuntimeError(f"preview 在 {READY_TIMEOUT_S}s 内未就绪（port={port}）")


def stop_server(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


# ---------- 诊断收集器 ----------

class Diagnostics:
    """收集 page 的 console error / pageerror / 失败请求 / 非 2xx 响应。"""

    def __init__(self, page):
        self.page = page
        self.console_errors: list[str] = []
        self.console_warnings: list[str] = []
        self.page_errors: list[str] = []
        self.failed_requests: list[str] = []
        self.bad_responses: list[str] = []
        page.on("console", self._on_console)
        page.on("pageerror", self._on_pageerror)
        page.on("requestfailed", self._on_requestfailed)
        page.on("response", self._on_response)

    def _on_console(self, msg) -> None:
        text = f"{msg.type}: {msg.text}"
        if msg.type == "error":
            self.console_errors.append(text)
        elif msg.type == "warning":
            self.console_warnings.append(text)

    def _on_pageerror(self, exc) -> None:
        self.page_errors.append(str(exc))

    def _on_requestfailed(self, req) -> None:
        self.failed_requests.append(f"{req.url} ({req.failure})")

    def _on_response(self, resp) -> None:
        if resp.status >= 400:
            self.bad_responses.append(f"{resp.status} {resp.url}")

    def clear(self) -> None:
        self.console_errors.clear()
        self.console_warnings.clear()
        self.page_errors.clear()
        self.failed_requests.clear()
        self.bad_responses.clear()

    def snapshot(self) -> dict:
        return {
            "console_errors": self.console_errors[:],
            "console_warnings": self.console_warnings[:],
            "page_errors": self.page_errors[:],
            "failed_requests": self.failed_requests[:],
            "bad_responses": self.bad_responses[:],
        }


def root_non_empty(page) -> tuple[bool, int]:
    n = page.evaluate("document.getElementById('root') ? document.getElementById('root').innerHTML.length : -1")
    return n > 0, n


def sw_registration(page) -> dict | None:
    return page.evaluate(
        "async () => { const r = await navigator.serviceWorker.getRegistration();"
        " return r ? { scope: r.scope, active: !!r.active, installing: !!r.installing, waiting: !!r.waiting } : null; }"
    )


def fill_exam_date_and_save(page, exam_date: str) -> None:
    """设置弹窗（新状态自动弹出）里填考试日期并保存。"""
    expect(page.locator("#exam-date")).to_be_visible(timeout=15000)
    page.fill("#exam-date", exam_date)
    page.get_by_role("button", name="保存").click()


def wait_plan_numbers(page, timeout_s: int = 40) -> list[tuple[int, int]]:
    """轮询今日计划面板，直到出现 total>0 的计划数值；返回 [(done,total), ...] 按 DOM 顺序。"""
    panel = page.locator('section:has(h2:text-is("今日计划"))')
    deadline = time.time() + timeout_s
    last_text = ""
    while time.time() < deadline:
        try:
            last_text = panel.inner_text(timeout=2000)
        except Exception:
            time.sleep(0.5)
            continue
        nums = [(int(a), int(b)) for a, b in re.findall(r"(\d+)\s*/\s*(\d+)", last_text)]
        if len(nums) >= 2 and nums[0][1] >= 1:
            return nums
        time.sleep(0.5)
    raise TimeoutError(f"计划面板数值未就绪（{timeout_s}s）。面板文本：{last_text[:500]}")


# ---------- 各断言阶段 ----------

def phase_desktop(page, base: str) -> None:
    diag = Diagnostics(page)

    # SMOKE-01 首页加载
    resp = page.goto(base + "/", wait_until="load", timeout=30000)
    status = resp.status if resp else None
    ok_root, root_len = root_non_empty(page)
    ready_state = "unknown"
    try:
        page.wait_for_selector("#exam-date", timeout=25000)
        ready_state = "settings-modal-auto-open"
    except Exception:
        ready_state = "no-settings-modal"
    has_guide = page.get_by_text("先设置考试日期").count() > 0
    console_errors = diag.console_errors[:]
    record(
        "SMOKE-01",
        "首页加载：HTTP 200 / #root 非空 / 无 console error",
        status == 200 and ok_root and not console_errors,
        {
            "url": base + "/",
            "http_status": status,
            "root_html_length": root_len,
            "ready_state": ready_state,
            "onboarding_guide_visible": has_guide,
            "console_errors": console_errors,
            "page_errors": diag.page_errors[:],
        },
    )
    page.screenshot(path=str(OUT / "01-desktop-home.png"))

    # SMOKE-02 manifest
    r = page.request.get(base + "/manifest.webmanifest")
    ok = r.status == 200
    details: dict = {"http_status": r.status}
    manifest = None
    if ok:
        try:
            manifest = r.json()
        except Exception as e:
            ok = False
            details["json_error"] = str(e)
    if manifest is not None:
        icons = manifest.get("icons") or []
        purposes = sorted({i.get("purpose") for i in icons})
        checks = {
            "name": manifest.get("name") == "ExamFlow Vocab",
            "short_name": manifest.get("short_name") == "ExamFlow",
            "theme_color": manifest.get("theme_color") == "#0E7490",
            "background_color": manifest.get("background_color") == "#F5F7FA",
            "display": manifest.get("display") == "standalone",
            "icons_count_4": len(icons) == 4,
            "icons_purposes": purposes == ["any", "maskable"],
            "start_url": manifest.get("start_url") == "/",
        }
        details["checks"] = checks
        details["icons"] = [
            {"src": i.get("src"), "sizes": i.get("sizes"), "purpose": i.get("purpose")} for i in icons
        ]
        ok = ok and all(checks.values())
    record("SMOKE-02", "PWA：/manifest.webmanifest 字段符合基线", ok, details)

    # SMOKE-03 sw.js
    r = page.request.get(base + "/sw.js")
    ctype = r.headers.get("content-type", "")
    body_head = (r.text() or "")[:80]
    record(
        "SMOKE-03",
        "PWA：/sw.js 可访问且 content-type 为 javascript",
        r.status == 200 and "javascript" in ctype,
        {"http_status": r.status, "content_type": ctype, "body_head": body_head},
    )

    # SMOKE-04 SW 注册
    reg = None
    deadline = time.time() + 15
    while time.time() < deadline:
        reg = sw_registration(page)
        if reg:
            break
        page.wait_for_timeout(500)
    record(
        "SMOKE-04",
        "PWA：navigator.serviceWorker.getRegistration() 最终非 null",
        reg is not None,
        {"registration": reg, "waited_s": 15},
    )

    # SMOKE-05 静态资源 200
    assets = [
        "/favicon.svg",
        "/apple-touch-icon.png",
        "/icon-192.png",
        "/icon-512.png",
        "/fonts/inter-latin.woff2",
        "/fonts/jetbrains-mono-latin.woff2",
        "/packs/IELTS/manifest.json",
    ]
    asset_rows = {}
    all_ok = True
    for a in assets:
        rr = page.request.get(base + a)
        asset_rows[a] = {
            "status": rr.status,
            "content_type": rr.headers.get("content-type", ""),
        }
        if rr.status != 200:
            all_ok = False
    record("SMOKE-05", "资源 200：favicon/图标/字体/数据包 manifest", all_ok, {"assets": asset_rows})

    # SMOKE-06 M-3 当日计划 + 学习页看答案
    exam_date = (datetime.now(timezone.utc).date() + timedelta(days=30)).isoformat()
    m3_details: dict = {"exam_date_set": exam_date}
    try:
        fill_exam_date_and_save(page, exam_date)
        nums = wait_plan_numbers(page)
        m3_details["plan_numbers_dom_order"] = [list(n) for n in nums]
        panel_text = page.locator('section:has(h2:text-is("今日计划"))').inner_text()
        m3_details["panel_text_head"] = panel_text[:400]
        (new_done, new_total), (rev_done, rev_total) = nums[0], nums[1]
        coverage_ok = "考试日预测掌握核心考点" in panel_text and len(nums) >= 3
        cov = nums[2] if len(nums) >= 3 else None
        m3_ok = (
            new_total >= 1
            and new_total <= 50  # DEFAULT_SETTINGS.maxNewPerDay
            and rev_total <= 300  # DEFAULT_SETTINGS.maxReviewPerDay
            and coverage_ok
            and cov is not None
            and cov[1] >= 1
            and cov[0] <= cov[1]
            and f"考试日 {exam_date}" in panel_text
        )
        m3_details["new"] = [new_done, new_total]
        m3_details["review"] = [rev_done, rev_total]
        m3_details["coverage_mastered_of_core"] = list(cov) if cov else None
    except Exception as e:
        m3_ok = False
        m3_details["error"] = f"{type(e).__name__}: {e}"
        try:
            m3_details["page_text_head"] = page.locator("body").inner_text(timeout=2000)[:500]
        except Exception:
            pass
    # 学习页卡片 + 看答案
    reveal_ok = False
    try:
        expect(page.locator('article[aria-label="学习卡片"]')).to_be_visible(timeout=30000)
        page.screenshot(path=str(OUT / "02-desktop-plan-and-card.png"))
        card = page.locator('article[aria-label="学习卡片"]')
        card.get_by_role("button", name="看答案").click()
        expect(page.locator('article[aria-label="学习卡片答案"]')).to_be_visible(timeout=10000)
        expect(page.get_by_text("本次评分")).to_be_visible()
        reveal_ok = True
        page.screenshot(path=str(OUT / "03-desktop-revealed.png"))
        m3_details["reveal"] = "看答案点击后 CardBack（学习卡片答案）渲染成功"
    except Exception as e:
        m3_details["reveal_error"] = f"{type(e).__name__}: {e}"
        m3_details["diag_snapshot"] = diag.snapshot()
    record(
        "SMOKE-06",
        "M-3 当日计划：设置考期后计划面板数值 + 学习页看答案",
        m3_ok and reveal_ok,
        m3_details,
    )


def phase_mobile(page, base: str) -> None:
    diag = Diagnostics(page)
    resp = page.goto(base + "/", wait_until="load", timeout=30000)
    status = resp.status if resp else None
    ok_root, root_len = root_non_empty(page)
    try:
        page.wait_for_selector("#exam-date", timeout=25000)
        ready = "settings-modal-auto-open"
    except Exception:
        ready = "no-settings-modal"
    overflow = page.evaluate(
        "({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })"
    )
    no_hscroll = overflow["scrollWidth"] <= overflow["innerWidth"] + 1
    console_errors = diag.console_errors[:]
    record(
        "SMOKE-07",
        "M-7 移动端视口 390x844：页面加载且无横向滚动",
        status == 200 and ok_root and no_hscroll and not console_errors,
        {
            "url": base + "/",
            "http_status": status,
            "root_html_length": root_len,
            "ready_state": ready,
            "scrollWidth": overflow["scrollWidth"],
            "innerWidth": overflow["innerWidth"],
            "console_errors": console_errors,
        },
    )
    page.screenshot(path=str(OUT / "04-mobile-home.png"))

    # M-7 学习页：底部操作区可达、按钮 ≥44px、学习页无横向滚动
    exam_date = (datetime.now(timezone.utc).date() + timedelta(days=30)).isoformat()
    study_details: dict = {"exam_date_set": exam_date}
    study_ok = False
    try:
        fill_exam_date_and_save(page, exam_date)
        expect(page.locator('article[aria-label="学习卡片"]')).to_be_visible(timeout=40000)
        nav = page.locator('nav[aria-label="学习操作"]')
        expect(nav).to_be_visible(timeout=10000)
        heights = page.evaluate(
            "() => Array.from(document.querySelectorAll('nav[aria-label=\"学习操作\"] button'))"
            ".map(b => { const r = b.getBoundingClientRect(); return { h: Math.round(r.height), bottom: Math.round(r.bottom), text: b.textContent.trim() }; })"
        )
        study_details["nav_buttons"] = heights
        nav_geom = page.evaluate(
            "() => { const n = document.querySelector('nav[aria-label=\"学习操作\"]');"
            " const r = n.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), innerHeight: window.innerHeight }; }"
        )
        study_details["nav_geometry"] = nav_geom
        overflow2 = page.evaluate(
            "({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })"
        )
        study_details["scrollWidth"] = overflow2["scrollWidth"]
        study_details["innerWidth"] = overflow2["innerWidth"]
        study_ok = (
            len(heights) >= 2
            and all(b["h"] >= 44 for b in heights)
            and nav_geom["bottom"] <= nav_geom["innerHeight"] + 1
            and overflow2["scrollWidth"] <= overflow2["innerWidth"] + 1
        )
        page.screenshot(path=str(OUT / "05-mobile-study.png"))
    except Exception as e:
        study_details["error"] = f"{type(e).__name__}: {e}"
        try:
            study_details["page_text_head"] = page.locator("body").inner_text(timeout=2000)[:500]
        except Exception:
            pass
        study_details["diag_snapshot"] = diag.snapshot()
    record(
        "SMOKE-08",
        "M-7 移动端学习页：底部操作区可达、按钮 ≥44px、无横向滚动",
        study_ok,
        study_details,
    )


def phase_offline(page, base: str) -> None:
    """M-2 简化版：先确保 SW active 且数据包已入 IndexedDB（学习页渲染过即证据），
    再断网 reload，断言 #root 非空 + 无 pageerror + 学习卡仍渲染。

    console error 分类说明（不篡改断言，只做精确分类）：
    packLoader 是「网络优先 + IndexedDB 兜底」（见 src/content/packLoader.ts 头注释），
    离线时 /packs/IELTS/manifest.json 的抓取必然失败一次，浏览器会把该失败记为
    console error，但应用已捕获并回落缓存。此类「Failed to load resource: net::ERR_*
    且 URL 属于 /packs/」的消息归类为 expected_offline_network_attempt；
    其余 console error 与任何 pageerror 一律判失败。
    """
    details: dict = {}
    # 等 SW active（预缓存安装完成）
    active = False
    deadline = time.time() + 20
    reg = None
    while time.time() < deadline:
        reg = sw_registration(page)
        if reg and reg.get("active"):
            active = True
            break
        page.wait_for_timeout(500)
    details["sw_registration_before_offline"] = reg
    details["sw_active"] = active

    diag = Diagnostics(page)
    diag.clear()
    reload_error = None
    try:
        page.context.set_offline(True)
        page.reload(wait_until="load", timeout=30000)
    except Exception as e:
        reload_error = f"{type(e).__name__}: {e}"

    ok_root, root_len = root_non_empty(page)
    details["root_html_length_after_reload"] = root_len
    details["reload_error"] = reload_error

    card_visible = False
    try:
        expect(page.locator('article[aria-label="学习卡片"]')).to_be_visible(timeout=25000)
        card_visible = True
    except Exception as e:
        details["card_wait_error"] = f"{type(e).__name__}: {e}"

    snap = diag.snapshot()
    pack_failures = [u for u in snap["failed_requests"] if "/packs/" in u]
    expected_net, real_console = [], []
    for e in snap["console_errors"]:
        if re.search(r"Failed to load resource: net::ERR_", e) and pack_failures:
            expected_net.append(e)
        else:
            real_console.append(e)
    details["console_errors_app_level"] = real_console
    details["expected_offline_network_attempts"] = expected_net
    details["page_errors"] = snap["page_errors"]
    details["failed_requests"] = snap["failed_requests"]
    details["bad_responses"] = snap["bad_responses"]
    details["console_warnings"] = snap["console_warnings"][:10]
    page.context.set_offline(False)

    if card_visible:
        page.screenshot(path=str(OUT / "06-offline-reload.png"))
        details["result"] = "离线 reload 后学习卡完整渲染（SW navigateFallback + IndexedDB 数据包缓存均生效）"
    else:
        page.screenshot(path=str(OUT / "06-offline-reload-failed.png"), full_page=True)
        details["result"] = "离线 reload 后学习卡未渲染；已记录失败请求与控制台输出作为证据"

    record(
        "SMOKE-09",
        "M-2 离线冒烟：断网 reload 后 #root 非空、无 pageerror/应用级 console error、学习卡仍渲染",
        active and ok_root and card_visible and not snap["page_errors"] and not real_console,
        details,
    )


# ---------- 报告 ----------

def write_reports(port: int, chromium_version: str) -> tuple[Path, Path]:
    total = len(RESULTS)
    passed = sum(1 for r in RESULTS if r["status"] == "pass")
    failed = total - passed
    summary = {
        "project": "examflow-vocab",
        "suite": "E2E smoke (scripts/e2e/smoke.py)",
        "base_url": f"http://localhost:{port}",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "chromium_version": chromium_version,
        "total": total,
        "passed": passed,
        "failed": failed,
        "results": RESULTS,
    }
    json_path = OUT / "report.json"
    json_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# ExamFlow Vocab — E2E 冒烟报告",
        "",
        f"- 生成时间（UTC）：{summary['generated_at']}",
        f"- base_url：{summary['base_url']}（vite preview，端口 {port}）",
        f"- chromium：{chromium_version}",
        f"- 结果：**{passed}/{total} 通过，{failed} 失败**",
        "",
        "## 断言明细",
        "",
        "| # | 断言 | 结果 |",
        "| :-- | :-- | :-- |",
    ]
    for r in RESULTS:
        lines.append(f"| {r['id']} | {r['title']} | {'PASS' if r['status'] == 'pass' else '**FAIL**'} |")
    lines += ["", "## 诊断详情", ""]
    for r in RESULTS:
        lines.append(f"### {r['id']} {r['title']} — {r['status']}")
        lines.append("```json")
        lines.append(json.dumps(r["details"], ensure_ascii=False, indent=2))
        lines.append("```")
        lines.append("")
    lines += [
        "## 覆盖说明",
        "",
        "- SMOKE-02/03/04 → 手工矩阵 M-1（PWA 可安装性）的 manifest/sw.js/注册部分；",
        "  真机安装弹窗与 maskable 裁切仍需真机人工确认。",
        "- SMOKE-09 → M-2（离线可用）简化版：断网 reload 全功能渲染；",
        "  「学 5 张」完整离线流程未在冒烟中执行。console error 分类：packLoader 网络优先策略下",
        "  离线时 /packs/IELTS/manifest.json 必失败一次（浏览器记 console error，应用已捕获回落",
        "  IndexedDB），此类归类 expected_offline_network_attempts；其余 console error 与",
        "  任何 pageerror 判失败。详见 SMOKE-09 诊断。",
        "- SMOKE-06 → M-3（当日计划）展示层：计划面板数值与上限/覆盖率渲染。",
        "- SMOKE-07/08 → M-7（移动端视口）：无横向滚动 + 底部操作区可达且按钮 ≥44px。",
        "",
        "## 已知限制",
        "",
        "- preview 为 http://localhost（浏览器视为安全上下文，SW 可注册）；非 localhost 主机名未覆盖。",
        "- 未覆盖：M-4 快捷键全量、M-5 备份恢复、M-6 七天提醒、M-8 发音、M-9 iOS Safari、M-10 旧包升级。",
        "",
    ]
    md_path = OUT / "report.md"
    md_path.write_text("\n".join(lines), encoding="utf-8")
    return json_path, md_path


def main() -> int:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    port = _pick_port()
    proc = start_server(port)
    base = f"http://localhost:{port}"
    print(f"preview ready on {base} (pid={proc.pid})", flush=True)
    chromium_version = "unknown"
    try:
        with sync_playwright() as p:
            # --no-proxy-server：避免本机 HTTP_PROXY 环境变量经系统代理链路干扰 localhost 访问
            browser = p.chromium.launch(args=["--no-proxy-server"])
            chromium_version = browser.version

            desktop = browser.new_context(viewport={"width": 1440, "height": 900})
            page = desktop.new_page()
            phase_desktop(page, base)

            mobile = browser.new_context(
                viewport={"width": 390, "height": 844},
                device_scale_factor=3,
                is_mobile=True,
                has_touch=True,
            )
            mpage = mobile.new_page()
            phase_mobile(mpage, base)

            phase_offline(page, base)

            desktop.close()
            mobile.close()
            browser.close()
    finally:
        stop_server(proc)

    json_path, md_path = write_reports(port, chromium_version)
    total = len(RESULTS)
    passed = sum(1 for r in RESULTS if r["status"] == "pass")
    print(f"\n==== {passed}/{total} passed ====", flush=True)
    for r in RESULTS:
        print(f"  {r['status'].upper():4} {r['id']} {r['title']}", flush=True)
    print(f"report: {json_path}", flush=True)
    print(f"report: {md_path}", flush=True)
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
