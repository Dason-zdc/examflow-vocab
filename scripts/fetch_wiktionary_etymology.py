#!/usr/bin/env python
"""从 Wiktionary 拉取词条的词源模板，作为「词源数据库」接入的原始数据。

产出的不是释义，而是**词源关系**：
  - origins：{{der|en|la|citare}} / {{inh|...}} / {{bor|...}} 中的来源语言与来源词；
  - roots  ：{{root|en|ine-pro|*key-}} 中的原始词根；
  - parts  ：{{affix|en|ex-|citare}} / {{suffix|...}} 中的构词成分。

同源词群随后由「(来源语言, 来源词) 相同」倒排得到 —— 这是词源级别的判定，
比形态匹配可靠得多（可以避免 portion 被算进 port 词族这类误判）。

用法：
  python scripts/fetch_wiktionary_etymology.py            # 抓取/增量更新
  python scripts/fetch_wiktionary_etymology.py --dry      # 只统计已有数据
"""
import glob
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PACK_DIR = os.path.join(SCRIPT_DIR, "..", "public", "packs", "IELTS")
OUT_JSON = os.path.join(SCRIPT_DIR, "build", "etymology-raw.json")

API = "https://en.wiktionary.org/w/api.php"
UA = "ExamFlowVocab/1.0 (etymology enrichment; contact: local)"
BATCH = 10          # 每批标题数（Wiktionary 对并发/频率敏感，10 较稳）
SLEEP = 1.2         # 请求间隔，避免 429；失败时按指数退避重试

LANG_SECTION_RE = re.compile(r"^==+\s*([^=]+?)\s*==+\s*$", re.M)
ETYM_HEAD_RE = re.compile(r"^===\s*Etymology[^=]*===\s*$", re.M)
# 词源类模板：der / inh / bor / l / m / derived / borrowed / inherited / root / affix / prefix / suffix / compound
ETYM_TPL_RE = re.compile(
    r"\{\{\s*(der|inh|bor|l|m|ll|derived|borrowed|inherited|root|affix|prefix|suffix|confix|compound)"
    r"\s*\|([^{}]*)\}\}",
    re.I,
)
# 语言代码：2-3 位小写，或 xx-yyy 形式（ine-pro / gem-pro / enm / fro ...）
LANG_CODE_RE = re.compile(r"^(?:[a-z]{2,3}(?:-[a-z]{2,6})?)$")


def http_get(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def load_pack_lemmas() -> list:
    words = []
    for path in sorted(glob.glob(os.path.join(PACK_DIR, "chunk-*.json"))):
        with open(path, encoding="utf-8") as f:
            words.extend(json.load(f)["words"])
    return sorted({w["lemma"].lower() for w in words})


def english_section(text: str) -> str:
    """截取 ==English== 段（到下一个同级语言标题为止）。"""
    m = re.search(r"^==\s*English\s*==\s*$", text or "", re.M)
    if not m:
        return ""
    rest = text[m.end():]
    nxt = re.search(r"^==\s*[^=]+\s*==\s*$", rest, re.M)
    return rest[: nxt.start()] if nxt else rest


def etymology_block(section: str) -> str:
    """截取 ===Etymology=== 小节（到下一个 === 标题为止，允许 Etymology 1 这种编号）。"""
    m = ETYM_HEAD_RE.search(section or "")
    if not m:
        return ""
    rest = section[m.end():]
    nxt = re.search(r"^===\s*[^=]+?\s*===\s*$", rest, re.M)
    return rest[: nxt.start()] if nxt else rest


def parse_templates(block: str) -> dict:
    out = {"origins": [], "roots": [], "parts": []}
    if not block:
        return out
    for m in ETYM_TPL_RE.finditer(block):
        name = m.group(1).lower()
        args = [a.strip() for a in m.group(2).split("|")]
        if not args:
            continue
        # 第一个参数常是语言代码（en），其后是来源语言 + 来源词
        if name == "root":
            # {{root|en|ine-pro|*key-}}
            if len(args) >= 3 and LANG_CODE_RE.match(args[1]):
                out["roots"].append({"lang": args[1], "term": args[2]})
            continue
        if name in ("affix", "prefix", "suffix", "confix", "compound"):
            # {{affix|en|ex-|citare}} —— 第 2 个参数起都是构词成分
            out["parts"].extend([a.strip("-") for a in args[1:] if a and a != "en"])
            continue
        # der / inh / bor / l / m：形如 {{der|en|la|citare}}
        if len(args) >= 3 and LANG_CODE_RE.match(args[1]):
            term = args[2]
            if term and not term.startswith("*"):
                out["origins"].append({"lang": args[1], "term": term})
        elif len(args) == 2 and LANG_CODE_RE.match(args[0]) and args[1]:
            out["origins"].append({"lang": args[0], "term": args[1]})
    return out


def fetch_batch(titles: list) -> dict:
    data = http_get({
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "titles": "|".join(titles),
    })
    pages = (data.get("query") or {}).get("pages") or []
    out = {}
    for p in pages:
        title = str(p.get("title", "")).lower()
        if p.get("missing"):
            out[title] = None
            continue
        revs = p.get("revisions") or []
        if not revs:
            out[title] = None
            continue
        slot = revs[0].get("slots", {}).get("main", {})
        out[title] = slot.get("content") or ""
    return out


def main() -> int:
    dry = "--dry" in sys.argv
    lemmas = load_pack_lemmas()
    store = {}
    if os.path.exists(OUT_JSON):
        with open(OUT_JSON, encoding="utf-8") as f:
            store = json.load(f)

    # 重试口径：页面确实不存在 -> {"missing": True}（不再重试）；请求失败 -> None 或缺失（重试）
    todo = [w for w in lemmas if w not in store or store.get(w) is None]
    done_ok = sum(1 for v in store.values() if v and v.get("missing") is not True)
    print("词条总数 %d，已抓取 %d，待抓取/重试 %d" % (len(lemmas), done_ok, len(todo)))
    if dry or not todo:
        hit = sum(1 for v in store.values() if v)
        print("已有词源数据的词：%d/%d = %.1f%%" % (hit, len(lemmas), 100.0 * hit / max(1, len(lemmas))))
        return 0

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    for i in range(0, len(todo), BATCH):
        batch = todo[i: i + BATCH]
        pages = None
        for attempt in range(4):
            try:
                pages = fetch_batch(batch)
                break
            except Exception as exc:  # noqa: BLE001 - 网络抓取，失败退避重试
                wait = SLEEP * (2 ** attempt)
                print("  批次 %s 失败（%s），%.1fs 后重试" % (batch[0], exc, wait))
                time.sleep(wait)
        if pages is None:
            print("  批次 %s 仍失败，跳过（下次运行会重试）" % batch[0])
            continue
        for title, content in pages.items():
            if content is None:
                store[title] = {"missing": True, "origins": [], "roots": [], "parts": [], "text": ""}
                continue
            sect = english_section(content)
            block = etymology_block(sect)
            parsed = parse_templates(block)
            store[title] = {
                "origins": parsed["origins"],
                "roots": parsed["roots"],
                "parts": parsed["parts"],
                "text": block.strip()[:400],
            }
        done = min(i + BATCH, len(todo))
        if done % 200 == 0 or done == len(todo):
            print("  进度 %d/%d" % (done, len(todo)))
            with open(OUT_JSON, "w", encoding="utf-8") as f:
                json.dump(store, f, ensure_ascii=False)
        time.sleep(SLEEP)

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False)
    hit = sum(1 for v in store.values() if v and (v.get("origins") or v.get("roots")))
    print("完成。有词源关系（origins/roots）的词：%d/%d = %.1f%%" % (hit, len(lemmas), 100.0 * hit / len(lemmas)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
