#!/usr/bin/env python3
"""构建全量查词词典（ECDICT → public/dict 分片 JSON）。

为什么单独一层，而不是塞进数据包：
  数据包是「按考试精选的 2000 词学习内容」，每词带义项权重、例句、同义分组；
  词典是「任意单词能不能查到」的兜底，二者生命周期与体积都不同。混在一起会让
  学习包从 4MB 涨到 8MB，而 95% 的词根本不会进入学习队列。

覆盖口径：
  - frq 1..60000、或带考试标签、或 Oxford/Collins 标记的中高频词；
  - 强制收录数据包全部词条与全部同义候选（否则卡上点开还是「查不到」）。
  ECDICT 全库 77 万条里大量是人名、地名、拼写变体与短语残片，全量入库是噪音。

分片规则：
  按首字母 a-z（其余归 `_`）切片，每片自带不规则变形表 `f`（form → lemma）。
  前端只在查词时加载一个片，最大片约 480KB，不需要一次性拉全量。

用法：
  python scripts/build_dict.py                    # 构建
  python scripts/build_dict.py --verify-only      # 只校验已产出的分片
  python scripts/build_dict.py --check-coverage   # 校验数据包里的词都能查到
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "scripts" / ".cache"
DEFAULT_ECDICT = CACHE / "ecdict.csv"
DEFAULT_OUT = ROOT / "public" / "dict"
DEFAULT_PACK = ROOT / "public" / "packs" / "IELTS"

FILTER_VERSION = "1"
MAX_WORD_LEN = 40
MAX_CN_LEN = 200
MAX_RANK = 60000
EXAM_TAGS = frozenset({"zk", "gk", "cet4", "cet6", "ky", "toefl", "ielts", "gre"})
WORD_RE = re.compile(r"^[A-Za-z][A-Za-z' \-]*$")
# ECDICT 缺失、但 WordNet 里存在的变体拼写（swash 的方言形），无法凭空补出释义
KNOWN_MISSING = {"swosh"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def rank_of(row: dict) -> int:
    try:
        return int(row.get("frq") or 0)
    except (TypeError, ValueError):
        return 0


def norm(word: str) -> str:
    return (word or "").strip().lower()


def in_scope(row: dict, word: str, forced: set[str]) -> bool:
    """是否进入词典。forced 是数据包词条与同义候选，必须可查，跳过频率门槛。"""
    if not word or len(word) > MAX_WORD_LEN or not WORD_RE.fullmatch(word):
        return False
    if not (row.get("translation") or "").strip():
        return False
    if word in forced:
        return True
    rank = rank_of(row)
    tags = set((row.get("tag") or "").split()) & EXAM_TAGS
    return 0 < rank <= MAX_RANK or bool(tags) or row.get("oxford") == "1" or (row.get("collins") or "0") != "0"


def compact_cn(raw: str) -> str:
    """ECDICT 的 translation 是「n. 债券\\nv. 结合」，压成单行，按分号边界截断。"""
    text = "；".join(part.strip() for part in (raw or "").replace("\\n", "\n").split("\n") if part.strip())
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= MAX_CN_LEN:
        return text
    cut = text[:MAX_CN_LEN]
    boundary = max(cut.rfind("；"), cut.rfind("，"), cut.rfind(","))
    return (cut[:boundary] if boundary > MAX_CN_LEN // 2 else cut).rstrip("；，, ")


def shard_of(word: str) -> str:
    first = word[:1]
    return first if "a" <= first <= "z" else "_"


def load_pack_words(pack_dir: Path) -> tuple[set[str], set[str]]:
    """返回（词包词条, 同义候选）。缺数据包时返回空集，词典仍可单独构建。"""
    words: set[str] = set()
    candidates: set[str] = set()
    files = sorted(pack_dir.glob("chunk-*.json"), key=lambda p: int(p.stem.split("-")[1]))
    if not files:
        return words, candidates
    for path in files:
        chunk = json.loads(path.read_text(encoding="utf-8"))
        for word in chunk.get("words", []):
            words.add(norm(word.get("lemma", "")))
            for sense in word.get("senses", []):
                for group in sense.get("synonymGroups") or []:
                    for cand in group.get("candidates") or []:
                        candidates.add(norm(cand.get("lemma", "")))
    return {w for w in words if w}, {c for c in candidates if c}


def collect(ecdict: Path, forced: set[str]) -> tuple[dict[str, dict], dict[str, str]]:
    """两遍扫描：第一遍定范围，第二遍取词条与变形。"""
    kept: set[str] = set()
    with ecdict.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            word = norm(row.get("word"))
            if in_scope(row, word, forced):
                kept.add(word)

    entries: dict[str, dict] = {}
    forms: dict[str, str] = {}
    with ecdict.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            word = norm(row.get("word"))
            if word in kept:
                entries.setdefault(
                    word,
                    {
                        "w": word,
                        "p": (row.get("phonetic") or "").strip(),
                        "t": compact_cn(row.get("translation") or ""),
                        "f": rank_of(row),
                    },
                )
            # 变形表：任何带 0:lemma 的条目都指向原形；只保留「本身不是词条」的变形
            exchange = row.get("exchange") or ""
            if "0:" not in exchange or not word or len(word) > MAX_WORD_LEN:
                continue
            lemma = ""
            for part in exchange.split("/"):
                if part.startswith("0:"):
                    lemma = norm(part[2:])
            if lemma in kept and word not in kept and WORD_RE.fullmatch(word):
                forms.setdefault(word, lemma)
    return entries, forms


def build(ecdict: Path, out: Path, pack_dir: Path, version: str) -> dict:
    pack_words, pack_candidates = load_pack_words(pack_dir)
    forced = pack_words | pack_candidates
    entries, forms = collect(ecdict, forced)

    by_shard: dict[str, list[dict]] = {}
    for entry in entries.values():
        by_shard.setdefault(shard_of(entry["w"]), []).append(entry)
    form_by_shard: dict[str, dict[str, str]] = {}
    for form, lemma in forms.items():
        form_by_shard.setdefault(shard_of(form), {})[form] = lemma

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    shards = []
    for shard in sorted(by_shard):
        items = sorted(by_shard[shard], key=lambda e: e["w"])
        payload: dict = {"e": [[e["w"], e["p"], e["t"], e["f"]] for e in items]}
        shard_forms = form_by_shard.get(shard) or {}
        if shard_forms:
            payload["f"] = dict(sorted(shard_forms.items()))
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        name = f"{shard}.json"
        (out / name).write_bytes(raw)
        shards.append(
            {
                "id": shard,
                "file": name,
                "entries": len(items),
                "forms": len(shard_forms),
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
            }
        )

    fingerprint = hashlib.sha256(
        json.dumps(
            {
                "v": FILTER_VERSION,
                "maxRank": MAX_RANK,
                "cn": MAX_CN_LEN,
                "entries": [entries[w] for w in sorted(entries)],
                "forms": dict(sorted(forms.items())),
            },
            ensure_ascii=False,
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()[:16]

    manifest = {
        "version": version,
        "fingerprint": fingerprint,
        "generatedAt": utc_now(),
        "count": len(entries),
        "formCount": len(forms),
        "source": {
            "name": "ECDICT",
            "url": "https://github.com/skywind3000/ECDICT",
            "license": "MIT",
            "used": "词条、音标、中文释义、词频序号、词形变化",
        },
        "scope": {
            "maxRank": MAX_RANK,
            "tags": sorted(EXAM_TAGS),
            "forcedInclude": {
                "packWords": len(pack_words),
                "synonymCandidates": len(pack_candidates),
            },
        },
        "shards": shards,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def iter_entries(out: Path, shard: dict):
    payload = json.loads((out / shard["file"]).read_text(encoding="utf-8"))
    for row in payload.get("e", []):
        yield row


def verify(out: Path) -> int:
    manifest_path = out / "manifest.json"
    if not manifest_path.exists():
        print(f"[FAIL] 缺少 {manifest_path}")
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors: list[str] = []
    seen: set[str] = set()
    total = 0
    for shard in manifest.get("shards", []):
        path = out / shard["file"]
        if not path.exists():
            errors.append(f"缺少分片 {shard['file']}")
            continue
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != shard["sha256"]:
            errors.append(f"{shard['file']} sha256 不匹配")
        if len(raw) != shard["bytes"]:
            errors.append(f"{shard['file']} bytes 不匹配（{len(raw)} != {shard['bytes']}）")
        payload = json.loads(raw)
        rows = payload.get("e") or []
        total += len(rows)
        if len(rows) != shard["entries"]:
            errors.append(f"{shard['file']} 条目数 {len(rows)} != {shard['entries']}")
        for row in rows:
            if len(row) != 4:
                errors.append(f"{shard['file']} 条目结构异常：{row[:2]}")
                break
            word = row[0]
            if word in seen:
                errors.append(f"重复词条 {word}")
            seen.add(word)
            if not row[2]:
                errors.append(f"{word} 缺中文释义")
            if "\n" in row[2]:
                errors.append(f"{word} 释义含换行")
        for form, lemma in (payload.get("f") or {}).items():
            if not form or not lemma or form == lemma:
                errors.append(f"{shard['file']} 变形表异常：{form} → {lemma}")
                break
    if total != manifest.get("count"):
        errors.append(f"总条目 {total} != manifest.count {manifest.get('count')}")
    if errors:
        print("[FAIL] 词典校验失败：")
        for err in errors[:20]:
            print("  -", err)
        return 1
    print(f"[OK] 词典 v{manifest['version']}｜{total} 词｜{len(manifest['shards'])} 分片｜指纹 {manifest['fingerprint']}")
    return 0


def check_coverage(out: Path, pack_dir: Path) -> int:
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    words: set[str] = set()
    forms: dict[str, str] = {}
    for shard in manifest["shards"]:
        payload = json.loads((out / shard["file"]).read_text(encoding="utf-8"))
        words.update(row[0] for row in payload.get("e") or [])
        forms.update(payload.get("f") or {})
    pack_words, candidates = load_pack_words(pack_dir)
    missing_c = sorted(c for c in candidates if c not in words and c not in forms)
    missing_w = sorted(w for w in pack_words if w not in words and w not in forms)
    unknown = [w for w in missing_c + missing_w if w not in KNOWN_MISSING]
    print(
        f"覆盖：同义候选 {len(candidates) - len(missing_c)}/{len(candidates)}｜"
        f"词包词条 {len(pack_words) - len(missing_w)}/{len(pack_words)}"
    )
    if unknown:
        print(f"[FAIL] {len(unknown)} 个词查不到：{unknown[:20]}")
        return 1
    if missing_c or missing_w:
        print(f"[i] 已知缺口（ECDICT 无词条）：{sorted(set(missing_c + missing_w))}")
    print("[OK] 数据包里所有可点词汇都能在词典中查到")
    return 0


def write_report(manifest: dict, out: Path, pack_dir: Path, path: Path) -> None:
    pack_words, candidates = load_pack_words(pack_dir)
    words: set[str] = set()
    forms: dict[str, str] = {}
    for shard in manifest["shards"]:
        payload = json.loads((out / shard["file"]).read_text(encoding="utf-8"))
        words.update(row[0] for row in payload.get("e") or [])
        forms.update(payload.get("f") or {})
    missing_c = sorted(c for c in candidates if c not in words and c not in forms)
    missing_w = sorted(w for w in pack_words if w not in words and w not in forms)
    unknown = [w for w in missing_c + missing_w if w not in KNOWN_MISSING]
    total = sum(s["entries"] for s in manifest["shards"])
    rows = [
        "# 全量查词词典 · 数据质量报告",
        "",
        "> 由 `scripts/build_dict.py` 自动生成，重新构建时覆盖。",
        f"> 词典版本：**v{manifest['version']}**｜指纹：`{manifest['fingerprint']}`｜生成时间：{manifest['generatedAt']}",
        f"> 结构校验：`python scripts/build_dict.py --verify-only`｜覆盖校验：`--check-coverage`",
        "",
        "## 1. 规模",
        "",
        "| 指标 | 值 |",
        "| :-- | --: |",
        f"| 词条数 | {total} |",
        f"| 变形条目（form → lemma） | {manifest['formCount']} |",
        f"| 分片数 | {len(manifest['shards'])} |",
        f"| 总体积 | {sum(s['bytes'] for s in manifest['shards']) / 1024 / 1024:.1f} MB |",
        f"| 最大分片 | {max(s['bytes'] for s in manifest['shards']) / 1024:.0f} KB |",
        "",
        "## 2. 覆盖（数据包里能点的词）",
        "",
        "| 指标 | 覆盖 |",
        "| :-- | --: |",
        f"| 同义候选 | {len(candidates) - len(missing_c)}/{len(candidates)} |",
        f"| 词包词条 | {len(pack_words) - len(missing_w)}/{len(pack_words)} |",
        f"| 无法覆盖（ECDICT 无词条） | {len(missing_c) + len(missing_w)} |",
        "",
        "## 3. 收录口径",
        "",
        f"- 频率序号 1~{manifest['scope']['maxRank']}，或带考试标签（{' / '.join(manifest['scope']['tags'])}），"
        "或 Oxford / Collins 标记；",
        "- 数据包全部词条与同义候选强制收录，不受频率门槛限制；",
        "- 排除多词残片、含数字、无中文释义的条目——词典是给人查的，不是 ECDICT 镜像。",
        "",
        "## 4. 已知缺口",
        "",
    ]
    if unknown:
        rows.append(f"- 未覆盖：{', '.join(f'`{w}`' for w in unknown)}（需要补词条，当前会显示「均未收录」）")
    else:
        rows.append("- 无：数据包里所有可点词都能查到。")
    if missing_c or missing_w:
        rows.append(f"- ECDICT 无词条：{', '.join(f'`{w}`' for w in sorted(set(missing_c + missing_w)))}")
    rows += [
        "",
        "## 5. 来源与许可",
        "",
        f"- {manifest['source']['name']}（{manifest['source']['license']}）：{manifest['source']['used']}",
        f"- 项目地址：{manifest['source']['url']}",
        "",
    ]
    path.write_text("\n".join(rows), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="构建全量查词词典（ECDICT → public/dict）")
    parser.add_argument("--ecdict", default=str(DEFAULT_ECDICT), help="ECDICT CSV 路径")
    parser.add_argument("--pack-dir", default=str(DEFAULT_PACK), help="数据包目录（用于强制收录与覆盖率校验）")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="输出目录")
    parser.add_argument("--version", default="1.0.0", help="词典版本号（内容变化由 fingerprint 反映）")
    parser.add_argument("--report", default=None, help="把质量报告写到指定 Markdown 路径")
    parser.add_argument("--verify-only", action="store_true", help="只校验已产出的分片")
    parser.add_argument("--check-coverage", action="store_true", help="校验数据包里的词都能查到")
    parser.add_argument("--dry", action="store_true", help="只统计规模，不写盘")
    args = parser.parse_args(argv)

    out = Path(args.out)
    pack_dir = Path(args.pack_dir)

    if args.verify_only:
        return verify(out)
    if args.check_coverage:
        return check_coverage(out, pack_dir)

    ecdict = Path(args.ecdict)
    if not ecdict.exists():
        print(f"[FAIL] 缺少 {ecdict}")
        print("  获取：https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv")
        return 1

    pack_words, candidates = load_pack_words(pack_dir)
    forced = pack_words | candidates
    if args.dry:
        entries, forms = collect(ecdict, forced)
        print(f"[dry] 词典 {len(entries)} 词｜变形 {len(forms)} 条｜强制收录 {len(forced)}")
        return 0

    manifest = build(ecdict, out, pack_dir, args.version)
    size = sum(s["bytes"] for s in manifest["shards"])
    print(
        f"[OK] 词典 v{manifest['version']}｜{manifest['count']} 词｜"
        f"{manifest['formCount']} 条变形｜{len(manifest['shards'])} 分片｜{size / 1024 / 1024:.1f} MB"
    )
    print(f"     指纹 {manifest['fingerprint']}｜输出 {out}")
    if args.report:
        write_report(manifest, out, pack_dir, Path(args.report))
        print(f"     质量报告 {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
