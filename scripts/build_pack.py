#!/usr/bin/env python3
"""一条命令重建 IELTS 数据包（Plan A）。

顺序不是随便排的——每一步都依赖上一步的产物：

  1. etl_build_pack.py         从 ECDICT 选词建包（新词此时还没有例句）
  2. build_word_families.py    补 wordFamily / derivatives（词根 / 同源词群 / 派生词）
  3. enrich_pack_sentences.py  用语料补例句，并把 picks 写回 scripts/build/
  4. etl_synonyms.py           按 WordNet 义项补同义替换（含义项级中文）
  5. build_dict.py             生成全量查词词典（必须最后跑：要强制收录本包所有候选）
  6. 五道门禁：build / synonyms / dict 三个 --verify-only + 词典覆盖率 + 数据包覆盖率

版本只在编排层决定一次（--version 或 --bump，缺省 patch），四个步骤写同一个版本。
各脚本自带的 1.3.0 / 1.4.0 / 1.5.0 / 1.6.0 常量已改成兜底值：跑错顺序不会再静默降版本。

用法：
  python scripts/build_pack.py                     # 全量重建，patch +1
  python scripts/build_pack.py --words 3000 --bump minor
  python scripts/build_pack.py --skip-sentences    # 无网时跳过语料补例句
  python scripts/build_pack.py --version 1.7.0     # 显式指定版本
  python scripts/build_pack.py --publish           # 重建后顺便 npm run build，更新 dist/
  python scripts/build_pack.py --skip-dict         # 只重建学习包，不动词典（词典与词包解耦）

注意：本脚本只改数据包；没有 --publish 时 dist/ 仍是旧包，需要自己再跑 npm run build。
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

from pack_version import bump, read_version, resolve_version

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
PACK_DIR = ROOT / "public" / "packs" / "IELTS"
CACHE = SCRIPT_DIR / ".cache"

# 关键输入：缺了就别跑。这些文件缺失时下游脚本是「静默降级」而不是报错
# （没有 lemma.en.txt 就没有词形变化，没有 tatoeba 语料就整包 sentencePending），
# 所以必须在编排层拦住。
ECDICT_RAW = "https://raw.githubusercontent.com/skywind3000/ECDICT/master"
REQUIRED = {
    "ecdict": ("ecdict.csv", "ECDICT 词库（约 63 MB）", f"{ECDICT_RAW}/ecdict.csv"),
    "lemma": ("lemma.en.txt", "词形变化库（约 2.3 MB）", f"{ECDICT_RAW}/lemma.en.txt"),
    "wordroot": ("wordroot.txt", "词根表（约 360 KB）", f"{ECDICT_RAW}/wordroot.txt"),
    "etym": ("../build/etymology-raw.json", "Wiktionary 词源快照", "python scripts/fetch_wiktionary_etymology.py"),
    "tatoeba": ("./tatoeba", "Tatoeba 语料缓存", "python scripts/fetch_tatoeba.py"),
    "wn": ("wn.db", "Open English WordNet 2021（约 109 MB）", "把 synset-lens 的 wn.db 复制到 scripts/.cache/wn.db"),
}

COVERAGE = SCRIPT_DIR / "check_pack_coverage.py"


def run_step(index: int, total: int, title: str, script: str, extra: list[str]) -> None:
    path = SCRIPT_DIR / script
    print("\n" + "=" * 68)
    print(f"[{index}/{total}] {title}  ({script})")
    print("=" * 68)
    started = time.time()
    result = subprocess.run([sys.executable, str(path), *extra])
    elapsed = time.time() - started
    if result.returncode != 0:
        raise SystemExit(f"\n[FAIL] 第 {index} 步失败：{script}（退出码 {result.returncode}），后续步骤未执行")
    print(f"[ok] {title} 用时 {elapsed:.1f}s")


def main() -> int:
    parser = argparse.ArgumentParser(description="一条命令重建 IELTS 数据包（含版本与门禁）")
    parser.add_argument("--words", type=int, default=None, help="目标词数（缺省沿用当前数据包词数，没有则 2000）")
    parser.add_argument("--version", default=None, help="写入的数据包版本（x.y.z）")
    parser.add_argument("--bump", default=None, choices=("major", "minor", "patch"), help="在现有版本上递增（缺省 patch）")
    parser.add_argument("--awl-file", default=None, help="外部学术词表（AWL）文本路径")
    parser.add_argument("--skip-families", action="store_true", help="跳过词根 / 同源词群 / 派生词")
    parser.add_argument("--skip-sentences", action="store_true", help="跳过语料补例句（无网时用）")
    parser.add_argument("--skip-synonyms", action="store_true", help="跳过义项级同义替换")
    parser.add_argument("--skip-dict", action="store_true", help="跳过全量查词词典")
    parser.add_argument("--dict-version", default="1.0.0", help="词典版本号（内容变化由 fingerprint 反映）")
    parser.add_argument("--no-api", action="store_true", help="补例句时不调用 Tatoeba API")
    parser.add_argument("--dry-check", action="store_true", help="只打印将要执行的命令与版本，不实际运行")
    parser.add_argument("--publish", action="store_true", help="门禁通过后执行 npm run build，把 dist/ 一起更新")
    args = parser.parse_args()

    current_version = read_version(PACK_DIR)
    if args.version:
        # 同时传 --version 与 --bump 属于配置错误，交给 resolve_version 报错而不是静默取一个
        target_version = resolve_version(PACK_DIR, explicit=args.version, part=args.bump)
    elif current_version:
        target_version = bump(current_version, args.bump or "patch")
    else:
        target_version = bump("0.0.0", "minor")  # 首次生成：1.0.0
        print("[i] 没有已发布数据包，从 1.0.0 开始")

    words = args.words
    if words is None:
        words = _current_word_count() or 2000

    print("=" * 68)
    print("ExamFlow Vocab · 数据包重建")
    print(f"  词数        {words}")
    print(f"  版本        {current_version or '（无）'} → {target_version}")
    print(f"  步骤        建包 → 词族{'' if not args.skip_families else '（跳过）'}"
          f" → 例句{'' if not args.skip_sentences else '（跳过）'}"
          f" → 同义{'' if not args.skip_synonyms else '（跳过）'}"
          f" → 词典{'' if not args.skip_dict else '（跳过）'}"
          " → 门禁")
    print("=" * 68)

    # 前置检查：只检查真正会用到的输入（dry-run 只警告，不拦）
    needed = ["ecdict"]
    if not args.skip_families:
        needed += ["lemma", "wordroot", "etym"]
    if not args.skip_sentences:
        needed += ["tatoeba"]
    if not args.skip_synonyms:
        needed += ["wn"]
    missing = []
    for key in needed:
        name, purpose, source = REQUIRED[key]
        path = (CACHE / name).resolve()
        if not path.exists():
            missing.append(f"  - 缺少 {purpose}：{path}\n    获取：{source}")

    steps: list[tuple[str, str, list[str]]] = [
        (
            "建包（选词 / 义项 / 释义 / 形近词）",
            "etl_build_pack.py",
            [a for a in [
                "--words", str(words),
                "--version", target_version,
                *(["--awl-file", args.awl_file] if args.awl_file else []),
            ]],
        ),
    ]
    if not args.skip_families:
        steps.append(("词根 / 同源词群 / 派生词", "build_word_families.py", ["--version", target_version]))
    if not args.skip_sentences:
        steps.append((
            "语料补例句（Tatoeba）",
            "enrich_pack_sentences.py",
            ["--version", target_version, *(["--no-api"] if args.no_api else [])],
        ))
    if not args.skip_synonyms:
        steps.append((
            "义项级同义替换（OEWN）",
            "etl_synonyms.py",
            ["--version", target_version, "--report", str(ROOT / "docs" / "DATA-QUALITY-SYNONYMS.md")],
        ))
    if not args.skip_dict:
        steps.append((
            "全量查词词典（ECDICT 分片）",
            "build_dict.py",
            ["--pack-dir", str(PACK_DIR), "--version", args.dict_version,
             "--report", str(ROOT / "docs" / "DATA-QUALITY-DICT.md")],
        ))

    if args.dry_check:
        print("\n[dry-run] 将执行：")
        for title, script, extra in steps:
            print(f"  python scripts/{script} {' '.join(extra)}")
        if not args.skip_dict:
            print(f"  python scripts/build_dict.py --verify-only")
            print(f"  python scripts/build_dict.py --check-coverage --pack-dir {PACK_DIR}")
        print(f"  python scripts/check_pack_coverage.py")
        if args.publish:
            print("  npm run build")
        if missing:
            print("\n[warn] 以下构建输入缺失（dry-run 不拦，真正重建会失败）：")
            print("\n".join(missing))
        return 0

    if missing:
        print("\n[FAIL] 缺少构建输入（这些文件缺失时下游会静默降级，所以在编排层拦住）：")
        print("\n".join(missing))
        return 1

    started = time.time()
    total = len(steps) + 1
    for index, (title, script, extra) in enumerate(steps, 1):
        run_step(index, total, title, script, extra)

    # 门禁：结构校验 + 覆盖率下限。任何一项失败就中断，不留半成品。
    print("\n" + "=" * 68)
    print(f"[{total}/{total}] 交付门禁")
    print("=" * 68)
    for script, extra in (
        ("etl_build_pack.py", ["--verify-only"]),
        ("etl_synonyms.py", ["--verify-only"]),
        ("build_dict.py", ["--verify-only"]),
        ("build_dict.py", ["--check-coverage", "--pack-dir", str(PACK_DIR)]),
    ):
        if script == "etl_synonyms.py" and args.skip_synonyms:
            continue
        if script == "build_dict.py" and args.skip_dict:
            continue
        result = subprocess.run([sys.executable, str(SCRIPT_DIR / script), *extra])
        if result.returncode != 0:
            raise SystemExit(f"[FAIL] {script} {' '.join(extra)} 未通过")
    coverage = subprocess.run([sys.executable, str(COVERAGE)])
    if coverage.returncode != 0:
        raise SystemExit("[FAIL] 覆盖率未达交付门槛")

    if args.publish:
        run_npm_build()

    elapsed = time.time() - started
    print("\n" + "=" * 68)
    print(f"[DONE] 数据包 v{target_version}｜{words} 词｜用时 {elapsed / 60:.1f} 分钟")
    print("  质量报告 docs/DATA-QUALITY.md / docs/DATA-QUALITY-SYNONYMS.md 已更新")
    if not args.skip_dict:
        print("  全量词典 public/dict/ 已更新（45k 词，按首字母分片）")
    if args.publish:
        print("  前端产物 dist/ 已重建，可直接 npm start")
    else:
        print("  发布前记得 npm run build（或加 --publish），否则 dist/ 里还是旧包")
    print("=" * 68)
    return 0


def run_npm_build() -> None:
    """在仓库根跑 npm run build：只改数据包不重建前端，dist/ 里还是旧包。"""
    print("\n" + "=" * 68)
    print("[publish] 构建前端产物（npm run build）")
    print("=" * 68)
    command = ["cmd", "/c", "npm", "run", "build"] if os.name == "nt" else ["npm", "run", "build"]
    if subprocess.run(command, cwd=ROOT).returncode != 0:
        raise SystemExit("[FAIL] npm run build 失败；数据包已更新，dist/ 未更新")


def _current_word_count() -> int:
    """沿用已发布数据包的词数，避免忘了传 --words 把 3000 词的包缩回 2000。"""
    manifest = PACK_DIR / "manifest.json"
    if not manifest.exists():
        return 0
    import json

    try:
        return int(json.loads(manifest.read_text(encoding="utf-8")).get("wordCount") or 0)
    except (ValueError, OSError):
        return 0


if __name__ == "__main__":
    sys.exit(main())
