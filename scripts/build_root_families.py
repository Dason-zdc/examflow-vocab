#!/usr/bin/env python
"""生成「织网」数据：词根 → 同根词索引（public/dict/root-families.json）。

数据链：src/content/affix-lexicon.json（人工校订词表，唯一真相源）
        + public/dict/*.json（45k 学习者词典，含中文释义与词频序号）
        → 每个词根取前 N 个高频同根词，附记忆公式。

为什么单独出索引：卡片只加载当前词，不需要全量词表；同根词网是「1 个词根
记 10 个词」的载体，必须能一次拿到该词根下的高频词。索引在构建期生成，
运行时只读，避免浏览器端扫 45k 词。

切分规则必须与 src/content/morphology.ts 保持一致（那边是运行时口径）：
  前缀* + 词根（+ 可选组合词根） + 后缀*，每个字母都要被成分解释，
  允许词尾不发音的 e；两字母后缀按白名单限制词长与词根长度。

用法：
  python scripts/build_root_families.py [--limit 12] [--dry]
"""
from __future__ import annotations

import argparse
import datetime
import glob
import json
import os
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
LEXICON = os.path.join(ROOT_DIR, "src", "content", "affix-lexicon.json")
DICT_DIR = os.path.join(ROOT_DIR, "public", "dict")
OUT = os.path.join(DICT_DIR, "root-families.json")

MAX_PREFIXES = 2
MAX_SUFFIXES = 3
MAX_AFFIX_LEN = 12
MIN_WORD = 6
MAX_WORD = 24
HARD_NEGATIONS = {"un", "non", "il", "ir"}
SHORT_SUFFIX_RULES = {
    "al": (6, 3), "ic": (6, 3), "fy": (6, 3), "or": (6, 3), "y": (7, 4),
}
COMPOUND_ROOTS = {"bene", "male"}

WORD_RE = re.compile(r"^[a-z]{6,24}$")
POS_RE = re.compile(r"^\s*([a-z]{1,5})\.")


def load_lexicon():
    with open(LEXICON, encoding="utf-8") as f:
        data = json.load(f)

    def build(rows, kind):
        out = {}
        for row in rows:
            form = str(row[0]).strip().lower()
            if not form or not re.fullmatch(r"[a-z]+", form):
                continue
            out.setdefault(form, {
                "kind": kind,
                "form": form,
                "cn": str(row[1]),
                "literal": str(row[2]),
                "origin": str(row[3]) if len(row) > 3 else "",
                "source": str(row[4]) if len(row) > 4 else "",
                "variants": [str(v).lower() for v in (row[5] if len(row) > 5 else [])],
            })
        return out

    blocked = {str(w).lower() for w in (data.get("blocked") or [])}
    prefixes = build(data["prefixes"], "PREFIX")
    roots = build(data["roots"], "ROOT")
    suffixes = build(data["suffixes"], "SUFFIX")
    aliases = {}
    for entry in roots.values():
        for variant in entry["variants"]:
            if variant not in roots:
                aliases.setdefault(variant, entry)
    return prefixes, roots, suffixes, aliases, blocked


def short_cn(entry):
    return re.split(r"[、；]", entry["cn"])[0]


def suffix_template(entry):
    return entry["literal"] if "{" in entry["literal"] else entry["cn"]


class Segmenter:
    def __init__(self):
        self.prefixes, self.roots, self.suffixes, self.aliases, self.blocked = load_lexicon()
        self.prefix_lens = sorted({len(k) for k in self.prefixes}, reverse=True)
        self.suffix_lens = sorted({len(k) for k in self.suffixes}, reverse=True)
        self.root_lens = sorted({len(k) for k in self.roots} | {len(k) for k in self.aliases}, reverse=True)
        self.root_lens = [n for n in self.root_lens if 3 <= n <= 15]

    def find_root(self, form):
        return self.roots.get(form) or self.aliases.get(form)

    def drafts(self, word, pos, kind):
        out = []
        n = len(word)
        if kind == "PREFIX":
            min_len = 1 if pos == 0 and word[0] == "e" and n >= 8 else 2
            for L in self.prefix_lens:
                if L < min_len or L > MAX_AFFIX_LEN or pos + L > n:
                    continue
                entry = self.prefixes.get(word[pos:pos + L])
                if entry:
                    out.append((entry, word[pos:pos + L], pos, pos + L))
        elif kind == "SUFFIX":
            for L in self.suffix_lens:
                if L < 2 or L > MAX_AFFIX_LEN or pos + L > n:
                    continue
                entry = self.suffixes.get(word[pos:pos + L])
                if entry:
                    out.append((entry, word[pos:pos + L], pos, pos + L))
        else:
            for L in self.root_lens:
                if pos + L > n:
                    continue
                entry = self.find_root(word[pos:pos + L])
                if entry:
                    out.append((entry, word[pos:pos + L], pos, pos + L))
        return out

    @staticmethod
    def short_suffix_ok(form, word_len, root_len):
        rule = SHORT_SUFFIX_RULES.get(form)
        if not rule:
            return len(form) >= 3
        return word_len >= rule[0] and root_len >= rule[1]

    def segment(self, word):
        n = len(word)
        # state key = (pos, phase) -> (score, parts, roots)
        states = {(0, 0): (0.0, [], 0)}
        for pos in range(n):
            for phase in (0, 1, 2):
                cur = states.get((pos, phase))
                if not cur:
                    continue
                score, parts, roots = cur
                if phase == 0:
                    if sum(1 for p in parts if p[1] == "PREFIX") < MAX_PREFIXES:
                        for entry, form, s, e in self.drafts(word, pos, "PREFIX"):
                            if e >= n:
                                continue
                            key = (e, 0)
                            val = (score + 2.2 * len(form), parts + [("PREFIX", form, entry, s, e)], roots)
                            if key not in states or val[0] > states[key][0]:
                                states[key] = val
                    for entry, form, s, e in self.drafts(word, pos, "ROOT"):
                        key = (e, 1)
                        val = (score + 4.0 * len(form) + (1 if entry["form"] == form else 0),
                               parts + [("ROOT", form, entry, s, e)], roots + 1)
                        if key not in states or val[0] > states[key][0]:
                            states[key] = val

                last_root = next((p for p in reversed(parts) if p[0] == "ROOT"), None)
                if phase == 1 and roots == 1 and last_root and last_root[2]["form"] in COMPOUND_ROOTS:
                    for entry, form, s, e in self.drafts(word, pos, "ROOT"):
                        key = (e, 1)
                        val = (score + 3.6 * len(form), parts + [("ROOT", form, entry, s, e)], roots + 1)
                        if key not in states or val[0] > states[key][0]:
                            states[key] = val

                if phase >= 1 and last_root and sum(1 for p in parts if p[1] == "SUFFIX") < MAX_SUFFIXES:
                    for entry, form, s, e in self.drafts(word, pos, "SUFFIX"):
                        if not self.short_suffix_ok(form, n, len(last_root[1])):
                            continue
                        key = (e, 2)
                        val = (score + 2.4 * len(form) - 0.6, parts + [("SUFFIX", form, entry, s, e)], roots)
                        if key not in states or val[0] > states[key][0]:
                            states[key] = val

        candidates = []
        for (pos, _phase), (score, parts, roots) in states.items():
            if roots < 1:
                continue
            penalty = 0.3 * max(0, len(parts) - 3)
            if pos == n:
                candidates.append((score - penalty, parts))
            elif pos == n - 1 and word[-1] == "e":
                candidates.append((score - penalty - 1.2, parts))
        if not candidates:
            return None
        candidates.sort(key=lambda t: (-t[0], len(t[1]), -max(len(p[1]) for p in t[1] if p[0] == "ROOT")))
        return candidates[0][1]

    @staticmethod
    def formula(parts):
        chunks = []
        for kind, form, entry, _s, _e in parts:
            if kind == "SUFFIX":
                chunks.append("%s(%s)" % (form, short_cn(entry)))
            else:
                chunks.append("%s(%s)" % (form, short_cn(entry)))
        return "+".join(chunks)


def primary_pos(cn):
    m = POS_RE.match(cn or "")
    if not m:
        return ""
    token = m.group(1)
    return {"a": "adj", "ad": "adv", "adv": "adv", "n": "n", "v": "v", "vt": "v", "vi": "v"}.get(token, token)


def core_cn(text, max_len=22):
    """词典释义取第一个词性段的头两个义项，去掉领域标注。"""
    if not text:
        return ""
    first = re.split(r"[；;]", text)[0]
    first = re.sub(r"^\s*[a-z]{1,5}\.\s*", "", first).strip()
    first = re.sub(r"^\s*\[[^\]]+\]\s*", "", first)
    items = [x.strip(" 。.()（）") for x in re.split(r"[,，、]", first) if x.strip()]
    return "、".join(items[:2])[:max_len]


def load_words():
    words = []
    for path in sorted(glob.glob(os.path.join(DICT_DIR, "[a-z].json"))):
        with open(path, encoding="utf-8") as f:
            payload = json.load(f)
        for row in payload.get("e", []):
            if not isinstance(row, list) or len(row) < 4:
                continue
            lemma, _phonetic, cn, rank = row[0], row[1], row[2], row[3]
            if not isinstance(lemma, str) or not isinstance(cn, str) or not cn:
                continue
            if not WORD_RE.match(lemma):
                continue
            if not isinstance(rank, int) or rank <= 0 or rank > 60000:
                continue
            words.append((lemma, cn, rank))
    return words


def main():
    ap = argparse.ArgumentParser(description="生成同根词网索引")
    ap.add_argument("--limit", type=int, default=12, help="每个词根保留的同根词上限")
    ap.add_argument("--min-members", type=int, default=2, help="低于该成员数的词根不输出")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    seg = Segmenter()
    words = load_words()
    print("[1/2] 词典词条：%d；词根表：%d（含变体 %d）" % (
        len(words), len(seg.roots), len(seg.aliases)))

    families = {}
    hit = 0

    def distinct(bucket, lemma):
        """同一派生链只留一个代表（predict / prediction / predictable 不占三个名额）。"""
        for item in bucket:
            other = item["lemma"]
            if other == lemma:
                return False
            if min(len(other), len(lemma)) >= 5 and (lemma.startswith(other) or other.startswith(lemma)):
                return False
        return True

    def finalize(items):
        items.sort(key=lambda x: (x["rank"], x["lemma"]))
        picked = []
        for item in items:
            if distinct(picked, item["lemma"]):
                picked.append(item)
            if len(picked) >= args.limit:
                break
        return picked

    for lemma, cn, rank in words:
        if lemma in seg.blocked:
            continue
        parts = seg.segment(lemma)
        if not parts:
            continue
        roots = [p for p in parts if p[0] == "ROOT"]
        if not roots:
            continue
        key = roots[-1][2]["form"]  # 组合词根取最后一个（bene+dict → dict）
        bucket = families.setdefault(key, [])
        bucket.append({
            "lemma": lemma,
            "pos": primary_pos(cn),
            "cn": core_cn(cn),
            "rank": rank,
            "formula": seg.formula(parts),
        })
        hit += 1

    out = {}
    for key, items in families.items():
        items = finalize(items)
        if len(items) < args.min_members:
            continue
        entry = seg.roots.get(key) or seg.aliases.get(key) or {}
        out[key] = {
            "cn": short_cn(entry) if entry else "",
            "origin": entry.get("origin", "") if entry else "",
            "words": [[i["lemma"], i["pos"], i["cn"], i["rank"], i["formula"]] for i in items[: args.limit]],
        }

    payload = {
        "version": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "affix-lexicon.json + public/dict（ECDICT 45k 学习者词条）",
        "roots": dict(sorted(out.items())),
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    print("[2/2] 词根家族：%d 个；命中词条：%d；产物 %.1f KB" % (
        len(out), hit, len(body) / 1024))
    if not args.dry:
        with open(OUT, "wb") as f:
            f.write(body)
        print("      写入 %s" % os.path.relpath(OUT, ROOT_DIR))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
