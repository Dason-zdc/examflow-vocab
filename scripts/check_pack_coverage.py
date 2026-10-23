#!/usr/bin/env python
"""数据包覆盖率体检（交付门禁用，可复跑）。

只读数据包，不写文件。默认检查 IELTS；其他词包用 --pack-dir 指定。
退出码非零表示核心验收未达标（编排脚本据此中断）。
"""
import argparse
import glob
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PACK = os.path.join(SCRIPT_DIR, "..", "public", "packs", "IELTS")


def load_words(pack_dir: str) -> list:
    words = []
    for path in sorted(glob.glob(os.path.join(pack_dir, "chunk-*.json"))):
        with open(path, encoding="utf-8") as fh:
            words.extend(json.load(fh).get("words", []))
    return words


def main() -> int:
    ap = argparse.ArgumentParser(description="数据包覆盖率体检")
    ap.add_argument("--pack-dir", default=DEFAULT_PACK)
    ap.add_argument("--min-en", type=float, default=95.0, help="词级英文释义覆盖率下限（%%）")
    ap.add_argument("--min-synonym-senses", type=float, default=60.0, help="有义项级同义的义项占比下限（%%）")
    ap.add_argument("--min-cn", type=float, default=10.0, help="同义候选带义项级中文的占比下限（%%）")
    args = ap.parse_args()

    words = load_words(args.pack_dir)
    if not words:
        print("FAIL: 数据包为空：%s" % args.pack_dir)
        return 1

    n_words = len(words)
    n_senses = 0
    word_any_en = word_all_en = 0
    sense_with_en = 0
    sense_missing_sentence = 0
    n_sentences = 0
    syn_senses = 0
    syn_total = syn_with_cn = syn_bad_conflict = syn_out_of_pack = 0
    root_hits = family_hits = deriv_hits = 0

    for w in words:
        senses = w.get("senses", [])
        n_senses += len(senses)
        if any(s.get("enDef") for s in senses):
            word_any_en += 1
        if senses and all(s.get("enDef") for s in senses):
            word_all_en += 1
        covered = {x.get("senseId") for x in w.get("sentences", [])}
        n_sentences += len(w.get("sentences", []))
        for s in senses:
            if s.get("enDef"):
                sense_with_en += 1
            if not s.get("sentencePending") and s.get("id") not in covered:
                sense_missing_sentence += 1
            groups = s.get("synonymGroups") or []
            if groups:
                syn_senses += 1
            for group in groups:
                for cand in group.get("candidates") or []:
                    syn_total += 1
                    if cand.get("cn"):
                        syn_with_cn += 1
                    if cand.get("status") == "CONFLICT" and not cand.get("note"):
                        syn_bad_conflict += 1
                    if not cand.get("inPack"):
                        syn_out_of_pack += 1
        if w.get("wordFamily"):
            root_hits += 1
            if (w["wordFamily"] or {}).get("members"):
                family_hits += 1
        if w.get("derivatives"):
            deriv_hits += 1

    def pct(part: int, whole: int) -> float:
        return 100.0 * part / max(1, whole)

    rows = [
        ("单词总数", f"{n_words}"),
        ("义项总数", f"{n_senses}"),
        ("例句总数", f"{n_sentences}"),
        ("词级英文释义覆盖（至少 1 条）", f"{word_any_en}/{n_words} = {pct(word_any_en, n_words):.1f}%"),
        ("词级英文释义覆盖（全部义项）", f"{word_all_en}/{n_words} = {pct(word_all_en, n_words):.1f}%"),
        ("逐义项英文释义覆盖", f"{sense_with_en}/{n_senses} = {pct(sense_with_en, n_senses):.1f}%"),
        ("无例句且未标记 pending 的义项", f"{sense_missing_sentence}"),
        ("有义项级同义的义项", f"{syn_senses}/{n_senses} = {pct(syn_senses, n_senses):.1f}%"),
        ("义项级同义候选总数", f"{syn_total}"),
        ("同义候选带义项级中文", f"{syn_with_cn}/{syn_total} = {pct(syn_with_cn, syn_total):.1f}%"),
        ("搭配不符但缺理由（应为 0）", f"{syn_bad_conflict}"),
        ("同义候选·库外词数", f"{syn_out_of_pack}"),
        ("P1 词根命中率", f"{root_hits}/{n_words} = {pct(root_hits, n_words):.1f}%"),
        ("P1 同源词群非空率", f"{family_hits}/{n_words} = {pct(family_hits, n_words):.1f}%"),
        ("P1 派生词非空率", f"{deriv_hits}/{n_words} = {pct(deriv_hits, n_words):.1f}%"),
    ]
    width = max(len(label) for label, _ in rows)
    print("=" * (width + 14))
    print("ExamFlow Vocab · 数据包覆盖率体检（%s）" % os.path.basename(os.path.abspath(args.pack_dir)))
    print("=" * (width + 14))
    for label, value in rows:
        print(f"  {label:<{width}}  {value}")
    print("=" * (width + 14))

    failures = []
    if pct(word_any_en, n_words) < args.min_en:
        failures.append("词级英文释义覆盖未达 %.0f%%" % args.min_en)
    if pct(syn_senses, n_senses) < args.min_synonym_senses:
        failures.append("义项级同义覆盖未达 %.0f%%（同义 ETL 是否漏跑？）" % args.min_synonym_senses)
    if pct(syn_with_cn, syn_total) < args.min_cn:
        failures.append("同义候选中文覆盖未达 %.0f%%（ECDICT 是否缺失？）" % args.min_cn)
    if syn_bad_conflict > 0:
        failures.append("存在判为搭配不符却没有理由的同义候选")

    if failures:
        for message in failures:
            print("FAIL: " + message)
        return 1
    print("OK: 覆盖率达到交付门槛")
    return 0


if __name__ == "__main__":
    sys.exit(main())
