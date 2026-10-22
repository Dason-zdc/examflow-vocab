#!/usr/bin/env python
"""数据包覆盖率体检（P0 验收用，可复跑）。

输出：词级/逐义项英文释义覆盖、义项总数、无例句义项数、近义词缺中文数、
例句总数。不写任何文件，只读 public/packs/IELTS。
"""
import glob
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PACK_DIR = os.path.join(SCRIPT_DIR, "..", "public", "packs", "IELTS")


def load_words() -> list:
    words = []
    for f in sorted(glob.glob(os.path.join(PACK_DIR, "chunk-*.json"))):
        with open(f, encoding="utf-8") as fh:
            payload = json.load(fh)
        words.extend(payload.get("words", []))
    return words


def main() -> int:
    words = load_words()
    n_words = len(words)
    word_all_en = 0          # 该词所有义项都有 enDef
    word_any_en = 0          # 该词至少一条义项有 enDef
    n_senses = 0
    sense_with_en = 0
    sense_missing_sentence = 0
    syn_total = 0
    syn_missing_cn = 0
    syn_out_of_pack = 0
    n_sentences = 0
    root_hits = 0          # P1：命中词根
    family_hits = 0        # P1：同源词群非空
    deriv_hits = 0         # P1：派生词非空

    for w in words:
        senses = w.get("senses", [])
        n_senses += len(senses)
        if any(s.get("enDef") for s in senses):
            word_any_en += 1
        if senses and all(s.get("enDef") for s in senses):
            word_all_en += 1
        covered = {x.get("senseId") for x in w.get("sentences", [])}
        for s in senses:
            n_sentences += 0  # 例句单独计数
            if s.get("enDef"):
                sense_with_en += 1
            if not s.get("sentencePending") and s.get("id") not in covered:
                sense_missing_sentence += 1
        for x in w.get("sentences", []):
            n_sentences += 1
        for syn in w.get("synonyms", []) or []:
            syn_total += 1
            if not syn.get("cn"):
                syn_missing_cn += 1
            if syn.get("outOfPack"):
                syn_out_of_pack += 1
        if w.get("wordFamily"):
            root_hits += 1
            if (w.get("wordFamily") or {}).get("members"):
                family_hits += 1
        if w.get("derivatives"):
            deriv_hits += 1

    rows = [
        ("单词总数", f"{n_words}"),
        ("义项总数", f"{n_senses}"),
        ("例句总数", f"{n_sentences}"),
        ("词级英文释义覆盖（至少 1 条）", f"{word_any_en}/{n_words} = {100*word_any_en/n_words:.1f}%"),
        ("词级英文释义覆盖（全部义项）", f"{word_all_en}/{n_words} = {100*word_all_en/n_words:.1f}%"),
        ("逐义项英文释义覆盖", f"{sense_with_en}/{n_senses} = {100*sense_with_en/n_senses:.1f}%"),
        ("无例句且未标记 pending 的义项", f"{sense_missing_sentence}"),
        ("近义词总数", f"{syn_total}"),
        ("近义词缺中文数", f"{syn_missing_cn}"),
        ("近义词·库外词数", f"{syn_out_of_pack}"),
        ("P1 词根命中率", f"{root_hits}/{n_words} = {100*root_hits/n_words:.1f}%"),
        ("P1 同源词群非空率", f"{family_hits}/{n_words} = {100*family_hits/n_words:.1f}%"),
        ("P1 派生词非空率", f"{deriv_hits}/{n_words} = {100*deriv_hits/n_words:.1f}%"),
    ]
    width = max(len(a) for a, _ in rows)
    print("=" * (width + 14))
    print("ExamFlow Vocab · IELTS 数据包覆盖率体检")
    print("=" * (width + 14))
    for label, value in rows:
        print(f"  {label:<{width}}  {value}")
    print("=" * (width + 14))

    # 退出码：核心验收不达标时非零（词级任一覆盖 < 95%）
    if 100 * word_any_en / n_words < 95:
        print("FAIL: 词级英文释义覆盖未达 95%")
        return 1
    if syn_missing_cn > 0:
        print("FAIL: 仍存在缺中文的近义词")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
