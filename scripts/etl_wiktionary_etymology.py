#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
etl_wiktionary_etymology.py — 从 Wiktionary（kaikki.org 离线抽取）核对并补全词根拆分

=============================================================================
为什么需要这一步
=============================================================================
`affix-lexicon.json` 的 114 前缀 / 313 词根 / 87 后缀是人工维护的，词的切分靠 DP
在词表上搜最优解。这带来两类问题：

1. **静默错拆**：`illegal` 曾被切成 `il + leg(读、选择) + al`——`leg` 是 `lect`
   （读）的变体，而 illegal 的 leg 来自 lex（法律）。DP 不知道这层，人工也没逐词核。
2. **召回不足**：能拆但没进 curated 的词只能躺在词根库里，学习卡上没有记忆链。

Wiktionary 的英语词条带 `{{prefix|en|con|sist}}` / `{{suffix|en|...}}` 这类词源模板，
wiktextract 已把它结构化成 `etymology_templates`。用它做两件事：
- **审计**：把 curated 的切分与 Wiktionary 对照，冲突的挑出来人工裁决；
- **召回**：给 AUTO 词一份「有词源依据的拆分」，作为起草记忆链的输入。

=============================================================================
数据来源与许可
=============================================================================
kaikki.org — 由 Wiktextract 从 Wiktionary 离线抽取，遵循 **CC BY-SA 3.0**
（Wiktionary 本身是 CC BY-SA / GFDL 双许可）。本项目只取用：
  - word / pos / etymology_text / etymology_templates
不取用释义正文，不复制例句。产物落在 scripts/.cache/（gitignore），
只用于生成我们自己的中文短义，不随数据包分发 Wiktionary 原文。

下载（约 534 MB gz / 解压 3.4 GB，解压后逐行流式读取，不落盘）：
  https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz

用法：
  python scripts/etl_wiktionary_etymology.py                 # 抽样 + 审计 + 候选
  python scripts/etl_wiktionary_etymology.py --limit 5000    # 只扫前 N 行（调试）
  python scripts/etl_wiktionary_etymology.py --report-only   # 不重扫，直接用已有 json

产物：
  scripts/.cache/wiktionary-etymology.json     目标词的词源记录（结构化）
  scripts/.cache/etymology-audit.md            审计报告（冲突清单 + 候选清单）
  scripts/.cache/etymology-candidates.json     AUTO 词的可起草候选（按权重排序）
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path
from typing import Any, Iterable

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
CACHE = SCRIPT_DIR / ".cache"
PACK_DIR = ROOT / "public" / "packs" / "IELTS"
LEXICON = ROOT / "src" / "content" / "affix-lexicon.json"

DUMP_GZ = CACHE / "kaikki-en.jsonl.gz"
OUT_ETYMOLOGY = CACHE / "wiktionary-etymology.json"
OUT_AUDIT = CACHE / "etymology-audit.md"
OUT_CANDIDATES = CACHE / "etymology-candidates.json"

# Wiktionary 的词源模板里，能表达「词由哪几块拼成」的那些
MORPH_TEMPLATES = {
    "prefix",
    "suffix",
    "affix",
    "af",
    "confix",
    "compound",
    "com",
    "circumfix",
    "infix",
    "pre",
    "suf",
    "blend",
}
KIND_BY_TEMPLATE = {
    "prefix": "prefix",
    "pre": "prefix",
    "suffix": "suffix",
    "suf": "suffix",
    "affix": "affix",
    "af": "affix",
    "confix": "confix",
    "compound": "compound",
    "com": "compound",
}

MAX_TEXT = 400

# Wiktionary 词源模板里常见的语言代码（只用于剔除首参，不求穷举）
LANG_CODES = {
    "en", "enm", "ang", "la", "LL", "ML", "fr", "frm", "fro", "de", "gmh", "goh",
    "it", "es", "nl", "grc", "el", "non", "gmw", "ine", "itc", "pi", "sa", "ar",
}


# ---------------------------------------------------------------------------
# 1. 输入
# ---------------------------------------------------------------------------
def load_targets() -> dict[str, dict[str, Any]]:
    """目标词 = IELTS 包内的词；带 pos 与 senseWeight，便于按热度排序。"""
    targets: dict[str, dict[str, Any]] = {}
    for path in sorted(PACK_DIR.glob("chunk-*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for word in data.get("words", []):
            lemma = str(word.get("lemma", "")).lower()
            if not lemma:
                continue
            senses = word.get("senses") or []
            weight = 0
            for sense in senses:
                stat = (sense.get("examStats") or {}).get("IELTS") or {}
                weight = max(weight, int(stat.get("senseWeight") or 0))
            targets[lemma] = {
                "id": word.get("id"),
                "pos": senses[0].get("pos", "") if senses else "",
                "senseCn": senses[0].get("cn", "") if senses else "",
                "weight": weight,
            }
    return targets


def load_lexicon() -> dict[str, Any]:
    return json.loads(LEXICON.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# 2. 抽取
# ---------------------------------------------------------------------------
def template_parts(template: dict[str, Any], known_forms: set[str]) -> list[dict[str, str]]:
    """把一个词源模板展开成成分序列。args 的数字键顺序就是词序。

    坑：Wiktionary 的模板第一个位置参数是**语言代码**（`{{prefix|en|con|sist}}`），
    直接按 1/2/3 取会把 `en`、`grc` 当成词素——报告里出现过 `grc + βίος + λογία`
    这种「拆分」。判据用我们自己的词表：不在词表里、且长度 ≤3 的首个参数视为语言代码丢弃；
    非 [a-z-] 的（希腊字母转写残留）一律丢弃。
    """
    name = str(template.get("name") or "").lower()
    if name not in MORPH_TEMPLATES:
        return []
    kind = KIND_BY_TEMPLATE.get(name, "affix")
    args = template.get("args") or {}
    raw_forms: list[str] = []
    for key in ("1", "2", "3", "4"):
        raw = args.get(key)
        if not isinstance(raw, str):
            continue
        form = raw.strip().strip("-").lower()
        if not form or not all(ch.isascii() and (ch.isalpha() or ch == "-") for ch in form):
            continue
        raw_forms.append(form)
    # 语言代码的判据不能只看「是否在词表里」：`en` 恰好也是后缀（使…）。
    # 模板规范是 {{prefix|en|con|sist}}，第一个位置参数就是语言；三参以上直接丢首项，
    # 两参时只在首项是已知语言码（或不在词表）时才丢，兼容 {{prefix|con|sist}} 旧写法。
    if len(raw_forms) >= 3:
        raw_forms = raw_forms[1:]
    elif len(raw_forms) == 2 and (raw_forms[0] in LANG_CODES or raw_forms[0] not in known_forms):
        raw_forms = raw_forms[1:]
    pieces = [{"kind": kind, "form": form} for form in raw_forms]
    if len(pieces) < 2:
        return []
    return pieces


def record_etymology(record: dict[str, Any], known_forms: set[str]) -> list[dict[str, Any]]:
    """一条 kaikki 记录可能有多组词源（etymology_number 不同），逐组保留。"""
    templates: Iterable[dict[str, Any]] = record.get("etymology_templates") or []
    groups: list[dict[str, Any]] = []
    current: dict[str, Any] = {
        "pos": record.get("pos", ""),
        "etymologyNumber": record.get("etymology_number"),
        "text": (record.get("etymology_text") or "").strip()[:MAX_TEXT],
        "parts": [],
        "templates": [],
        "hyphenation": record.get("hyphenation") or [],
    }
    for template in templates:
        name = str(template.get("name") or "").lower()
        expansion = template.get("expansion") or ""
        pieces = template_parts(template, known_forms)
        if pieces:
            current["parts"].append({"template": name, "pieces": pieces})
            current["templates"].append(f"{name}: " + " + ".join(p["form"] for p in pieces))
        elif expansion:
            current["templates"].append(f"{name}: {expansion}"[:120])
    if current["parts"] or current["text"]:
        groups.append(current)
    return groups


def scan(limit: int | None = None) -> dict[str, list[dict[str, Any]]]:
    if not DUMP_GZ.exists():
        raise SystemExit(
            f"缺少 {DUMP_GZ}。先下载（约 534 MB）：\n"
            "  curl -L --retry 3 -C - -o scripts/.cache/kaikki-en.jsonl.gz "
            "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz"
        )
    targets = load_targets()
    known_forms = lexicon_forms(load_lexicon())
    found: dict[str, list[dict[str, Any]]] = {}
    scanned = 0
    hit_lines = 0
    print(f"目标词 {len(targets)} 个，开始扫描 {DUMP_GZ.name}…", flush=True)
    with gzip.open(DUMP_GZ, "rt", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            scanned += 1
            if limit and scanned > limit:
                break
            if scanned % 200_000 == 0:
                print(f"  已扫 {scanned:,} 行，命中 {hit_lines} 条", flush=True)
            # 粗筛：字节级检查比 json.loads 便宜得多
            if '"lang_code": "en"' not in line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            word = str(record.get("word") or "").lower()
            if word not in targets:
                continue
            groups = record_etymology(record, known_forms)
            if not groups:
                continue
            hit_lines += 1
            found.setdefault(word, []).extend(groups)
            # 同一个词可能有多条同形记录（不同 pos），都收
    print(f"扫描完成：{scanned:,} 行，命中 {hit_lines} 条，覆盖 {len(found)} 个目标词", flush=True)
    return found


# ---------------------------------------------------------------------------
# 3. 审计
# ---------------------------------------------------------------------------
def flatten_forms(groups: list[dict[str, Any]]) -> list[str]:
    """取第一条带拆分记录的第一个模板，按词序拉平成 form 列表。"""
    for group in groups:
        for part in group.get("parts") or []:
            return [piece["form"] for piece in part["pieces"]]
    return []


def curated_forms(record: dict[str, Any] | None) -> list[str]:
    if not record:
        return []
    return [str(part[1]).lower() for part in record.get("parts") or []]


def normalise(form: str) -> str:
    return form.strip("-").lower()


def lexicon_forms(lexicon: dict[str, Any]) -> set[str]:
    """词表里所有可命中的 form（含词根变体）。成分不在表里就写不进 curated。"""
    forms: set[str] = set()
    for key in ("prefixes", "roots", "suffixes"):
        for row in lexicon.get(key) or []:
            if isinstance(row, list) and row and isinstance(row[0], str):
                forms.add(row[0].lower())
            if isinstance(row, list) and len(row) > 5 and isinstance(row[5], list):
                forms.update(str(v).lower() for v in row[5])
    return forms


def audit(found: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    lexicon = load_lexicon()
    curated = lexicon.get("curated") or {}
    known_forms = lexicon_forms(lexicon)
    targets = load_targets()

    consistent: list[str] = []
    conflicts: list[dict[str, Any]] = []
    no_lexicon: list[str] = []
    for word, groups in found.items():
        wiki = flatten_forms(groups)
        if not wiki:
            continue
        cur = curated_forms(curated.get(word))
        if not cur:
            no_lexicon.append(word)
            continue
        a = {normalise(x) for x in wiki}
        b = {normalise(x) for x in cur}
        if [normalise(x) for x in wiki] == [normalise(x) for x in cur]:
            consistent.append(word)
        else:
            conflicts.append(
                {
                    "word": word,
                    "curated": cur,
                    "wiktionary": wiki,
                    # 只切在不同粒度（共享成分）与完全另一套解释，处置方式不同
                    "relation": "overlap" if a & b else "disjoint",
                    "text": (groups[0].get("text") or "")[:160],
                }
            )

    # 候选：Wiktionary 给出拆分、当前没有 curated、且权重不低的词
    candidates: list[dict[str, Any]] = []
    for word in no_lexicon:
        meta = targets.get(word)
        if not meta:
            continue
        groups = found[word]
        wiki = flatten_forms(groups)
        if not wiki:
            continue
        # 只留「有前后缀、成分 2-4 个」的，纯复合词先不进（词根表覆盖不到）
        kinds = [
            piece["kind"]
            for group in groups
            for part in group.get("parts") or []
            for piece in part.get("pieces") or []
        ]
        if not any(k in {"prefix", "suffix"} for k in kinds):
            continue
        if not (2 <= len(wiki) <= 4):
            continue
        # 成分必须都能在词表里查到，否则 curated 写进去也切不出来
        if any(normalise(form) not in known_forms for form in wiki):
            continue
        candidates.append(
            {
                "lemma": word,
                "weight": meta.get("weight") or 0,
                "senseCn": meta.get("senseCn") or "",
                "parts": wiki,
                "templates": groups[0].get("templates") or [],
                "text": (groups[0].get("text") or "")[:200],
            }
        )
    candidates.sort(key=lambda c: (-c["weight"], c["lemma"]))

    return {
        "targets": len(targets),
        "covered": len(found),
        "consistent": consistent,
        "conflicts": conflicts,
        "candidates": candidates,
        "noLexicon": no_lexicon,
    }


def write_report(result: dict[str, Any]) -> None:
    lines = [
        "# Wiktionary 词源审计（scripts/.cache，不入库）",
        "",
        "> 数据源：kaikki.org / Wiktextract → Wiktionary（CC BY-SA 3.0）。",
        "> 本文件只用于核对切分与起草记忆链，不随数据包分发原文。",
        "",
        "## 覆盖",
        "",
        f"- IELTS 目标词：{result['targets']}",
        f"- Wiktionary 命中：{result['covered']}（{result['covered'] / max(1, result['targets']) * 100:.1f}%）",
        f"- 现有 curated 与 Wiktionary 完全一致：{len(result['consistent'])}",
        f"- 切分粒度不同（共享成分）：{sum(1 for c in result['conflicts'] if c['relation'] == 'overlap')}",
        f"- 成分完全对不上（需人工裁决）：{sum(1 for c in result['conflicts'] if c['relation'] == 'disjoint')}",
        f"- 可起草候选（Wiktionary 有前后缀拆分、当前未 curated）：{len(result['candidates'])}",
        "",
    ]
    disjoint = [c for c in result["conflicts"] if c["relation"] == "disjoint"]
    overlap = [c for c in result["conflicts"] if c["relation"] == "overlap"]
    if disjoint:
        lines += ["## 成分完全对不上（必须人工裁决）", "", "| 词 | curated 切分 | Wiktionary 切分 | 词源原文 |", "| --- | --- | --- | --- |"]
        for item in disjoint:
            lines.append(
                f"| {item['word']} | {' + '.join(item['curated'])} | {' + '.join(item['wiktionary'])} | {item['text'][:120].replace(chr(10), ' ')} |"
            )
        lines.append("")
    if overlap:
        lines += ["## 切分粒度不同（共享成分，通常不用改）", "", "| 词 | curated 切分 | Wiktionary 切分 |", "| --- | --- | --- |"]
        for item in overlap:
            lines.append(f"| {item['word']} | {' + '.join(item['curated'])} | {' + '.join(item['wiktionary'])} |")
        lines.append("")
    if result["candidates"]:
        lines += ["## 候选 Top 40（按 senseWeight）", "", "| 词 | 权重 | 释义 | Wiktionary 拆分 |", "| --- | --- | --- | --- |"]
        for item in result["candidates"][:40]:
            lines.append(f"| {item['lemma']} | {item['weight']} | {item['senseCn'][:18]} | {' + '.join(item['parts'])} |")
        lines.append("")
    lines += [
        "## 下一步",
        "",
        "1. 冲突项逐条裁决：Wiktionary 也分「词源相同」与「俗词源」，以人工词表为准，改词表而不是改数据。",
        "2. 候选按权重起草 `atoms + literal`，写入 `affix-lexicon.json` 的 `curated`，`authoredBy` 标 `AI_DRAFTED`。",
        "3. 起草后重跑本脚本，冲突数应为 0；再跑 `npx vitest run src/content/morphology.test.ts`。",
    ]
    OUT_AUDIT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Wiktionary 词源审计")
    parser.add_argument("--limit", type=int, default=None, help="只扫前 N 行（调试）")
    parser.add_argument("--report-only", action="store_true", help="用已有 json 重出报告")
    args = parser.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    if args.report_only:
        payload = json.loads(OUT_ETYMOLOGY.read_text(encoding="utf-8"))
        found = payload["words"]
    else:
        found = scan(args.limit)
        OUT_ETYMOLOGY.write_text(
            json.dumps({"source": "kaikki.org / Wiktextract (CC BY-SA 3.0)", "words": found}, ensure_ascii=False, indent=1),
            encoding="utf-8",
        )

    result = audit(found)
    write_report(result)
    OUT_CANDIDATES.write_text(
        json.dumps({"generatedFrom": "wiktionary-etymology.json", "candidates": result["candidates"]}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    print("\n=== 审计结果 ===")
    print(f"目标词        : {result['targets']}")
    print(f"Wiktionary 命中: {result['covered']}")
    print(f"curated 一致   : {len(result['consistent'])}")
    print(f"冲突           : {len(result['conflicts'])}")
    print(f"可起草候选     : {len(result['candidates'])}")
    print(f"报告           : {OUT_AUDIT.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
