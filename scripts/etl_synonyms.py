#!/usr/bin/env python3
"""义项级同义替换 ETL（PRD US-08 / README G-3）。

旧实现（scripts/enrich_pack_synonyms.mjs）按「词性取前 2 个同义集求并集」产出
词级 pairs，有三个结构性缺陷（详见 synset-lens/analysis/requirement-analysis.md）：

  RC1 主键是 word 而不是 (word, sense) → 跨义项污染
  RC3 候选不带义项 → 用户看到 lie「躺着」dwell「居住」这类张冠李戴的释义
  RC5 丢掉搭配框架 → `consist of` 与 `consist in` 的替换词集合完全不相交，却被混成一锅

本脚本按 synset 分组重写该字段：

  1. 主键是 synset_id，词形只是入口（同义严格等于同 synset，上下位/类义不冒充同义）；
  2. 每个分组带该义项的英文释义与搭配框架，`consist of` / `consist in` 各自成组；
  3. 候选带五态质量分级（可替换 / 框架一致 / 需改写 / 搭配不符 / 待验证），
     需改写的给出模板（`consist of O → comprise O`），不可用的给出理由；
  4. 搭配证据从 gloss 尾介词与 WordNet 例句抽，句法兼容性用 WordNet 官方子类框架判定
     （覆盖率近 100%，弥补例句覆盖不足）；
  5. 中文释义只在该候选词义项唯一时贴上，不把词级最高频释义贴到别的义项上。

数据源：Open English WordNet 2021（CC BY 4.0），SQLite 直读，无第三方依赖。

用法：
  python scripts/etl_synonyms.py --wn-db ../synset-lens/data/wn/wn.db --dry
  python scripts/etl_synonyms.py --wn-db ... --report docs/DATA-QUALITY-SYNONYMS.md
  python scripts/etl_synonyms.py --verify-only
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

from pack_version import add_version_args, resolve_version
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACK_DIR = ROOT / "public" / "packs" / "IELTS"
NEXT_VERSION = "1.0.0"   # 兜底值；实际版本由 main() 从 manifest / --version 决定
VERSION_FALLBACK = "1.6.0"  # 数据包还没有 manifest 时（首次生成）用它

MAX_GROUPS = 3          # 每张卡最多几个义项分组（OEWN 义项按常用度排序，取前 N）
MAX_CANDIDATES = 4      # 每个分组最多几个候选
MAX_GLOSS = 120         # 释义截断，控制数据包体积

# ---------- 五态模型（与 src/domain/types.ts 的 SynonymStatus 一一对应） ----------
DIRECT = "DIRECT"       # 语料证明该候选在此义项带同样的搭配，可原句直接换
INFERRED = "INFERRED"   # 语料未覆盖候选词形，但官方框架与查询义项一致
REWRITE = "REWRITE"     # 同义，但句法实现不同（及物性 / 介词），需按模板改写
CONFLICT = "CONFLICT"   # 语料显示该候选在此义项用别的介词，不能原句替换
UNKNOWN = "UNKNOWN"     # 既无语料也无框架，不做判断

RANK = {DIRECT: 3, INFERRED: 2, REWRITE: 1, UNKNOWN: 0, CONFLICT: -1}

# 官方子类框架的兼容性判定（移植自 synset-lens/src/frames.py）
SAME, NP_PP, DIFF, FRAME_UNKNOWN = "same", "np_pp", "diff", "unknown"

PREPOSITIONS = frozenset(
    """
    of in on to with from for into onto upon by as at about against between among
    through over under within without after before during near beyond toward towards
    than like per
    """.split()
)

NO_PREP = "∅"

# 合规红线：粗口/侮辱性词条不进词库（旧实现已被实测串出 fuck_off / bugger_off）
PROFANITY = frozenset(
    """
    fuck fucker fucking motherfucker shit shitty bullshit crap piss prick cunt twat
    bastard bitch whore slut dick cock asshole arsehole bugger wank tosser bollocks
    damn goddamn
    """.split()
)

# 古体拼写对学习者是噪音（WordNet 仍收录），不进词库
ARCHAIC = frozenset({"shew", "shewed", "shewn", "chuse", "chused", "wont", "fain"})

POS_TO_WN = {"n.": "n", "v.": "v", "adj.": "a", "a.": "a", "adv.": "r", "r.": "r", "s.": "s"}
WN_TO_POS = {"n": "n.", "v": "v.", "a": "adj.", "s": "adj.", "r": "adv."}

# 中文释义切段：`由…组成；在于` / `居住、居住(于)` 都要能切
CN_SEPARATOR = re.compile(r"[、,，;；/]")
# ECDICT translation 的行首词性标签（`n. 罩；风帽` / `v. 覆盖`）
CN_POS_LINE = re.compile(r"^(n|v|vt|vi|a|adj|ad|adv|r)\.?\s+(.*)$", re.IGNORECASE)
CN_POS_MAP = {"n": "n.", "v": "v.", "vt": "v.", "vi": "v.", "a": "adj.", "adj": "adj.", "ad": "adv.", "adv": "adv.", "r": "adv."}

# 词形派生会把同形异义的屈折形式也算进来（lie 的 lied 只属于「说谎」那一义），手工剔除
FORM_EXCLUDE = {"lie": frozenset({"lied"})}

IRREGULAR = {
    "be": ("am", "is", "are", "was", "were", "been", "being"),
    "become": ("became", "becoming"),
    "begin": ("began", "begun", "beginning"),
    "bear": ("bore", "borne", "born"),
    "bring": ("brought", "bringing"),
    "build": ("built", "building"),
    "come": ("came", "coming"),
    "do": ("does", "did", "done", "doing"),
    "draw": ("drew", "drawn", "drawing"),
    "drive": ("drove", "driven", "driving"),
    "dwell": ("dwelt",),
    "fall": ("fell", "fallen", "falling"),
    "find": ("found", "finding"),
    "give": ("gave", "given", "giving"),
    "go": ("goes", "went", "gone", "going"),
    "grow": ("grew", "grown", "growing"),
    "hold": ("held", "holding"),
    "keep": ("kept", "keeping"),
    "know": ("knew", "known", "knowing"),
    "lead": ("led", "leading"),
    "leave": ("left", "leaving"),
    "lie": ("lay", "lain", "lying"),
    "lose": ("lost", "losing"),
    "make": ("made", "making"),
    "mean": ("meant", "meaning"),
    "meet": ("met", "meeting"),
    "pay": ("paid", "paying"),
    "rise": ("rose", "risen", "rising"),
    "run": ("ran", "running"),
    "say": ("said", "saying"),
    "see": ("saw", "seen", "seeing"),
    "seek": ("sought", "seeking"),
    "sell": ("sold", "selling"),
    "send": ("sent", "sending"),
    "show": ("showed", "shown", "showing"),
    "spend": ("spent", "spending"),
    "stand": ("stood", "standing"),
    "take": ("took", "taken", "taking"),
    "tell": ("told", "telling"),
    "think": ("thought", "thinking"),
    "understand": ("understood", "understanding"),
    "write": ("wrote", "written", "writing"),
}


# --------------------------------------------------------------------------- 词形

def head_forms(word: str) -> set[str]:
    """派生单个词的可能屈折形式（规则覆盖多数，不规则表兜高频例外）。"""
    w = word.lower()
    forms: set[str] = {w}
    forms.update(IRREGULAR.get(w, ()))

    forms.add(w + "es" if w.endswith(("s", "x", "z", "ch", "sh")) else w + "s")

    if w.endswith("e"):
        forms.update({w + "d", w[:-1] + "ing"})
    else:
        forms.update({w + "ed", w + "ing"})

    if w.endswith("y") and len(w) > 1 and w[-2] not in "aeiou":
        forms.update({w[:-1] + "ies", w[:-1] + "ied"})

    if len(w) >= 3 and w[-1] not in "aeiouwxy" and w[-2] in "aeiou" and w[-3] not in "aeiou":
        forms.update({w + w[-1] + "ed", w + w[-1] + "ing"})

    forms.difference_update(FORM_EXCLUDE.get(w, frozenset()))
    return forms


def forms_of(lemma: str) -> set[str]:
    parts = lemma.lower().split()
    if not parts:
        return set()
    head, tail = parts[0], parts[1:]
    return {" ".join([f, *tail]) for f in head_forms(head)}


@lru_cache(maxsize=4096)
def surface_pattern(lemma: str, forms: tuple[str, ...] = ()) -> re.Pattern[str]:
    """匹配词条任意屈折形式的正则；卡上有 forms 时用卡上的（比规则派生准）。"""
    alternatives = forms_of(lemma) | {f.lower() for f in forms if f}
    body = "|".join(re.escape(a) for a in sorted(alternatives, key=len, reverse=True))
    return re.compile(rf"(?<![A-Za-z]){body}(?![A-Za-z])", re.IGNORECASE)


def is_variant(a: str, b: str) -> bool:
    """同词根的屈折/派生形式不是同义替换（walk / walked）。"""
    return b.lower() in forms_of(a) or a.lower() in forms_of(b)


# --------------------------------------------------------------------------- 搭配

BE_FORMS = frozenset({"am", "is", "are", "was", "were", "be", "been", "being"})


def frames_of_examples(lemma: str, examples: list[str], forms: tuple[str, ...] = ()) -> dict[str, list[str]]:
    """返回 {框架: [证据句]}；直接带宾语记作 NO_PREP。

    被动句（`is comprised in this paper`）里紧跟 be 动词的过去分词不算主动句框架：
    它的介词是句法位置带来的，照它生成「comprise in O → contain O」这种模板就是错的。
    """
    pattern = surface_pattern(lemma, forms)
    found: dict[str, list[str]] = {}
    for sentence in examples:
        for match in pattern.finditer(sentence):
            surface = match.group(0).lower()
            before = sentence[: match.start()]
            previous = re.search(r"([A-Za-z]+)\s*$", before)
            if previous and previous.group(1).lower() in BE_FORMS and re.search(r"(ed|en)$", surface):
                continue
            tail = re.match(r"[\s,]+([A-Za-z']+)", sentence[match.end():])
            key = NO_PREP
            if tail and tail.group(1).lower() in PREPOSITIONS:
                key = tail.group(1).lower()
            found.setdefault(key, []).append(sentence)
    return found


def gloss_frame(gloss: str) -> str:
    """gloss 尾部介词，只在释义本身是「短语式框架」时才认。

    WordNet 动词释义常以 `be composed of` / `originate (in)` 收尾，这类短语式释义
    本身就是框架声明；但长释义（"have its essential character; ..."）尾部的 in
    只是句子成分，用它判搭配会把 consist with 那一组污染掉。
    """
    tokens = re.findall(r"[A-Za-z']+", (gloss or "").lower())
    if not tokens or len(tokens) > 4:
        return ""
    preps = [t for t in tokens[-4:] if t in PREPOSITIONS]
    return preps[-1] if preps else ""


# --------------------------------------------------------------------------- 官方框架

_SUBJECT = {"somebody": "human", "something": "thing", "it": "it"}
_FRAME = re.compile(r"^(?P<subj>[A-Za-z]+)(?:\s+is)?\s+----(?:ing|s)\s*(?P<tail>.*)$", re.IGNORECASE)
_TOKENS = (
    ("adjective/noun", "ADJ"),
    ("that clause", "CLAUSE"),
    ("to infinitive", "INF"),
    ("to somebody", "PP"),
    ("to something", "PP"),
    ("adj", "ADJ"),
    ("pp", "PP"),
    ("somebody", "NP"),
    ("something", "NP"),
)


def parse_official(frame: str) -> tuple[str, tuple[str, ...]] | None:
    matched = _FRAME.match(" ".join(frame.split()))
    if matched is None:
        return None
    subject = _SUBJECT.get(matched.group("subj").lower(), matched.group("subj").lower())
    rest = " ".join(matched.group("tail").lower().split())
    comps: list[str] = []
    while rest:
        for token, label in _TOKENS:
            if rest.startswith(token):
                comps.append(label)
                rest = rest[len(token):].lstrip()
                break
        else:
            break
    return subject, tuple(comps)


def official_verdict(query_frames: tuple[str, ...], cand_frames: tuple[str, ...]) -> str:
    """比较查询词与该候选在同一个 synset 下的官方框架，取最兼容的一对。"""
    weight = {SAME: 0, NP_PP: 1, DIFF: 2}
    best, best_weight = FRAME_UNKNOWN, 3
    for q_raw in query_frames:
        q = parse_official(q_raw)
        if q is None:
            continue
        for c_raw in cand_frames:
            c = parse_official(c_raw)
            if c is None:
                continue
            if set(q[1]) == set(c[1]):
                code = SAME
            elif ("PP" in q[1] and "NP" not in q[1] and "NP" in c[1] and "PP" not in c[1]) or (
                "NP" in q[1] and "PP" not in q[1] and "PP" in c[1] and "NP" not in c[1]
            ):
                code = NP_PP
            else:
                code = DIFF
            if weight[code] < best_weight:
                best, best_weight = code, weight[code]
    return best


# --------------------------------------------------------------------------- WordNet

class WordNet:
    """只读 OEWN SQLite；按需批量预载，避免逐次查询。"""

    def __init__(self, db_path: Path) -> None:
        if not db_path.exists():
            raise SystemExit(
                f"找不到 WordNet 数据库：{db_path}\n"
                "请指定 --wn-db（Open English WordNet 2021 的 wn.db，约 109 MB），"
                "或把它放到 scripts/.cache/wn.db。"
            )
        self.conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        self.cur = self.conn.cursor()
        self.synset_ids: dict[int, str] = {}
        self.definitions: dict[int, str] = {}
        self.examples: dict[int, list[str]] = defaultdict(list)
        self.members: dict[int, list[str]] = defaultdict(list)
        self.member_pos: dict[tuple[int, str], str] = {}
        self.phrase_frames: dict[tuple[int, str], set[str]] = defaultdict(set)
        self.frames: dict[tuple[int, str], tuple[str, ...]] = {}
        self.synsets_of: dict[tuple[str, str], list[int]] = {}

    def locate(self, lemmas: set[str]) -> None:
        """建立 (lemma, pos) → 该词条各义项的 synset 序列（按 OEWN 常用度排序）。"""
        for lemma in sorted(lemmas):
            if " " in lemma or "-" in lemma:
                continue
            for pos in ("n", "v", "a", "s", "r"):
                entry_id = f"oewn-{lemma}-{pos}"
                row = self.cur.execute("SELECT rowid FROM entries WHERE id = ?", (entry_id,)).fetchone()
                if row is None:
                    continue
                rows = self.cur.execute(
                    "SELECT s.synset_rowid, sy.id FROM senses s JOIN synsets sy ON sy.rowid = s.synset_rowid"
                    " WHERE s.entry_rowid = ? ORDER BY s.entry_rank, s.synset_rank",
                    (row[0],),
                ).fetchall()
                self.synsets_of[(lemma, pos)] = [sid for sid, _ in rows]
                for sid, synset_id in rows:
                    self.synset_ids[sid] = synset_id

    def preload(self) -> None:
        """把需要的 synset 一次性灌进内存：释义、例句、成员、官方框架。"""
        sids = sorted(self.synset_ids)
        if not sids:
            return
        self.cur.execute("CREATE TEMP TABLE need (sid INTEGER PRIMARY KEY)")
        self.cur.executemany("INSERT OR IGNORE INTO need VALUES (?)", [(s,) for s in sids])

        for sid, definition in self.cur.execute(
            "SELECT d.synset_rowid, d.definition FROM definitions d JOIN need n ON n.sid = d.synset_rowid"
        ):
            self.definitions.setdefault(sid, definition or "")

        for sid, example in self.cur.execute(
            "SELECT e.synset_rowid, e.example FROM synset_examples e JOIN need n ON n.sid = e.synset_rowid"
        ):
            self.examples[sid].append(example)

        for sid, entry_id, pos in self.cur.execute(
            "SELECT s.synset_rowid, e.id, e.pos FROM senses s JOIN entries e ON e.rowid = s.entry_rowid"
            " JOIN need n ON n.sid = s.synset_rowid"
        ):
            lemma = lemma_of_entry(entry_id)
            if not lemma:
                continue
            self.members[sid].append(lemma)
            self.member_pos[(sid, lemma.lower())] = pos
            # 词组词条自带框架：同义集里有 `lie in`，说明 `lie` 在此义项可带 in
            parts = lemma.split()
            if len(parts) > 1 and parts[-1].lower() in PREPOSITIONS:
                self.phrase_frames[(sid, parts[0].lower())].add(parts[-1].lower())

        for sid, entry_id, frame in self.cur.execute(
            "SELECT s.synset_rowid, e.id, b.frame FROM syntactic_behaviour_senses x"
            " JOIN syntactic_behaviours b ON b.rowid = x.syntactic_behaviour_rowid"
            " JOIN senses s ON s.rowid = x.sense_rowid"
            " JOIN entries e ON e.rowid = s.entry_rowid"
            " JOIN need n ON n.sid = s.synset_rowid"
        ):
            lemma = lemma_of_entry(entry_id)
            if not lemma:
                continue
            key = (sid, lemma.lower())
            self.frames[key] = tuple(sorted({*self.frames.get(key, ()), frame}))

    def synset_sequence(self, lemma: str, pos: str) -> list[int]:
        return self.synsets_of.get((lemma.lower(), POS_TO_WN.get(pos, "")), [])

    def synset_id(self, sid: int) -> str:
        return self.synset_ids.get(sid, "")

    def gloss(self, sid: int) -> str:
        return (self.definitions.get(sid) or "").strip()

    def members_of(self, sid: int) -> list[str]:
        return sorted({m for m in self.members.get(sid, [])})

    def pos_of(self, sid: int, lemma: str) -> str:
        return self.member_pos.get((sid, lemma.lower()), "")

    def official_frames(self, sid: int, lemma: str) -> tuple[str, ...]:
        return self.frames.get((sid, lemma.lower()), ())

    def intrinsic_frames(self, sid: int, lemma: str) -> set[str]:
        """同义集里的词组成员（如 `lie in`）把介词写在词形上，可回填给单词成员。"""
        return set(self.phrase_frames.get((sid, lemma.lower()), ()))


def lemma_of_entry(entry_id: str) -> str:
    """`oewn-consist-v` → `consist`；多词词条 `oewn-lie_in-v` → `lie in`。"""
    if not entry_id.startswith("oewn-"):
        return ""
    body = entry_id[len("oewn-"):]
    head, _, _pos = body.rpartition("-")
    return head.replace("_", " ").strip()


# --------------------------------------------------------------------------- 数据包

def load_pack(pack_dir: Path) -> tuple[list[tuple[Path, dict]], dict]:
    chunks = []
    for file in sorted(pack_dir.glob("chunk-*.json"), key=lambda p: int(p.stem.split("-")[1])):
        chunks.append((file, json.loads(file.read_text(encoding="utf-8"))))
    manifest = json.loads((pack_dir / "manifest.json").read_text(encoding="utf-8"))
    return chunks, manifest


def cn_segments(cn: str) -> list[str]:
    """中文释义切成义项段：`由…组成；在于` → ['由…组成', '在于']，掉过短的噪音段。"""
    parts = [p.strip(" .。()（）") for p in CN_SEPARATOR.split(cn or "")]
    return [p for p in parts if len(p) >= 2]


def cn_index(chunks: list[tuple[Path, dict]]) -> dict[tuple[str, str], set[str]]:
    """(lemma, pos) → 该词该词性所有义项的中文义项段。

    本项目的卡片是「一个词性的一个义项」，但中文把同词性多义合并了（平均 2.8 个义项点，
    88% 的卡如此）。所以卡片中文不能直接当义项级释义，只能当「这张卡讲了哪些中文意思」
    的口径；候选的中文必须与它求交才认（见 bind_cn）。
    """
    index: dict[tuple[str, str], set[str]] = defaultdict(set)
    for _file, chunk in chunks:
        for word in chunk.get("words", []):
            for sense in word.get("senses", []):
                index[(word["lemma"].lower(), sense.get("pos") or "")].update(cn_segments(sense.get("cn") or ""))
    return index


def load_ecdict(path: Path, lemmas: set[str]) -> dict[str, dict[str, set[str]]]:
    """ECDICT 词条的中文义项段：lemma → pos → {段}。

    只用于「候选词不在数据包内」时的中文来源。ECDICT 是词级数据，单独贴出去就是 RC3，
    所以它的用途仅限于与卡片中文求交（bind_cn），不单独当释义用。
    """
    if not path.exists():
        print(f"[warn] 缺少 ECDICT（{path}），库外候选将不带中文；可用 --ecdict 指定")
        return {}
    index: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            key = (row.get("word") or "").lower()
            if key not in lemmas:
                continue
            for raw in (row.get("translation") or "").split("\\n"):
                matched = CN_POS_LINE.match(raw.strip())
                if matched is None:
                    continue
                pos = CN_POS_MAP.get(matched.group(1).lower(), "")
                if pos:
                    index[key][pos] |= set(cn_segments(matched.group(2)))
    return index


def bind_cn(
    cand: str,
    pos: str,
    query_segments: set[str],
    cn_of: dict[tuple[str, str], set[str]],
    ecdict: dict[str, dict[str, set[str]]],
) -> str:
    """候选的义项级中文 = 候选中文义项段与卡片中文**唯一重合**的那一段。

    不做翻译，也不贴「该词最高频释义」，重合本身就是义项对齐的证据：
    consist（由…组成；在于）× comprise（包含、由…组成）⇒ 唯一重合「由…组成」，
    正是 be composed of 这一组的中文；dwell（居住、居住(于)）与它无重合 ⇒ 不贴，
    避免出现「dwell 居住」这种张冠李戴。
    """
    segments = set(cn_of.get((cand, pos), set())) | ecdict.get(cand, {}).get(pos, set())
    shared = query_segments & segments
    return next(iter(shared)) if len(shared) == 1 else ""


def ambiguous_cn(cn: str) -> bool:
    """含分隔符说明该中文合并了多个义项，不能当义项级释义用。"""
    return bool(re.search(r"[、,，;；/]", cn))


# --------------------------------------------------------------------------- 判定

def _template(query: str, q_frame: str, cand: str, c_frame: str) -> str:
    left = f"{query} {q_frame} O" if q_frame else f"{query} O"
    right = f"{cand} {c_frame} O" if c_frame else f"{cand} O"
    return f"{left} → {right}"


def judge(
    query_preps: set[str],
    cand_preps: set[str],
    cand_bare: bool,
    canonical: str,
    verdict: str,
    query: str,
    cand: str,
) -> tuple[str, str, str]:
    """五态判定：先看介词实现（语料），再用义项框架（gloss）与官方框架兜底。

    `comprise` 是 `consist of` 唯一正确的替换词，语料里它直接带宾语（∅）。
    旧实现在这里判「不可用」，等于把唯一答案作废；正确判法是「同义，需去掉介词」。

    两条防误报的红线：
    - 介词改写模板只在义项 gloss 本身声明了框架时生成（`be composed of` → of）。
      否则 `hold in place` 的 in 会被当成搭配，产出 `maintain O → hold in O`。
    - 官方框架判定一致（SAME）时，介词差异按状语处理，不判冲突。
    """
    q_frame = "/".join(sorted(query_preps))
    c_frame = "/".join(sorted(cand_preps))

    if query_preps & cand_preps:
        return DIRECT, "", ""

    if query_preps and cand_preps:
        if canonical and canonical in cand_preps:
            return (
                REWRITE,
                f"同义集内，但义项框架是 {canonical}，要按候选的介词改写",
                _template(query, q_frame, cand, c_frame),
            )
        if canonical and canonical in query_preps:
            return CONFLICT, f"该义项语料里它带 {c_frame}，不带 {q_frame}", ""
        if verdict == SAME:
            return DIRECT, "", ""
        return UNKNOWN, f"两边语料介词不同（{q_frame} / {c_frame}），需按原句判断", ""

    if query_preps and cand_bare:
        if canonical and canonical in query_preps:
            return (
                REWRITE,
                "同义集内，但它在此义项直接带宾语，需去掉介词",
                _template(query, q_frame, cand, ""),
            )
        if verdict == SAME:
            return DIRECT, "", ""
        return UNKNOWN, f"查询词在这里带 {q_frame}，候选直接带宾语，需按原句判断", ""

    if query_preps:
        if verdict == SAME:
            return INFERRED, "语料未覆盖该词形；官方框架与该义项一致，介词待验证", ""
        if verdict == NP_PP:
            return REWRITE, "同义集内，但及物性不同，需改写句法", _template(query, q_frame, cand, "")
        return UNKNOWN, "无语料证据，官方框架也不足以判断", ""

    # 查询词在该义项没有介词槽（或语料未覆盖）
    if cand_preps:
        if canonical and canonical in cand_preps:
            return (
                REWRITE,
                f"同义集内，但它在此义项要带 {c_frame}，需补介词",
                _template(query, "", cand, c_frame),
            )
        if verdict == SAME:
            return DIRECT, "", ""
        return UNKNOWN, f"该义项语料里它带 {c_frame}，是否为搭配需按原句判断", ""

    if verdict in (SAME, FRAME_UNKNOWN):
        return DIRECT, "", ""
    if verdict == NP_PP:
        return REWRITE, "同义集内，但及物性不同，需改写句法", _template(query, "", cand, "")
    return UNKNOWN, "无语料证据，且补足语结构不同", ""


def acceptable(lemma: str, query: str) -> bool:
    if lemma.lower() == query.lower():
        return False
    if not re.fullmatch(r"[a-z]{3,14}", lemma):
        return False
    if lemma in PROFANITY or lemma in ARCHAIC:
        return False
    return not is_variant(query, lemma)


def build_groups(
    word: dict,
    sense: dict,
    wn: WordNet,
    cn_of: dict[tuple[str, str], set[str]],
    ecdict: dict[str, dict[str, set[str]]],
    in_pack: set[str],
) -> list[dict]:
    lemma = word["lemma"].lower()
    pos = sense.get("pos", "")
    query_segments = set(cn_segments(sense.get("cn") or ""))
    forms = tuple(word.get("forms") or ())
    sentences = word.get("sentences") or []

    # 卡上例句（该义项的句子）里的搭配证据
    own_examples = [s.get("en", "") for s in sentences if s.get("senseId") == sense.get("id") and s.get("en")]
    pack_frames = {f for f in frames_of_examples(lemma, own_examples, forms) if f != NO_PREP}

    groups: list[dict] = []
    for sid in wn.synset_sequence(lemma, pos):
        pool = [m for m in wn.members_of(sid) if acceptable(m, lemma)]
        gloss = wn.gloss(sid)
        if not pool or not gloss:
            continue

        synset_id = wn.synset_id(sid)
        syn_examples = wn.examples.get(sid, [])
        canonical = gloss_frame(gloss)
        is_verb = POS_TO_WN.get(pos, "") == "v"

        # 查询词在本义项语料里的用法。卡上例句只在「框架与本义项相容」时才算本义项的证据：
        # consist 的卡面例句是 consist of，把它套到 originate (in) 那一组会把 dwell 误判成冲突。
        observed = frames_of_examples(lemma, syn_examples) if is_verb else {}
        observed_preps = {f for f in observed if f != NO_PREP}
        observed_bare = NO_PREP in observed
        compatible = observed_preps | ({canonical} if canonical else set())
        query_preps = observed_preps | (compatible & pack_frames)
        if not query_preps and not observed_bare and canonical:
            query_preps = {canonical}

        official_query = wn.official_frames(sid, lemma)

        candidates: list[tuple[int, dict]] = []
        for cand in pool:
            if is_verb:
                observed_cand = frames_of_examples(cand, syn_examples)
                cand_preps = {f for f in observed_cand if f != NO_PREP}
                cand_preps |= wn.intrinsic_frames(sid, cand)
                cand_bare = NO_PREP in observed_cand
                verdict = official_verdict(official_query, wn.official_frames(sid, cand))
                status, note, rewrite = judge(
                    query_preps, cand_preps, cand_bare, canonical, verdict, lemma, cand
                )
            else:
                # 名词/形容词的介词是补足语模式（the trend of ...），不是替换槽位：
                # 用同一套框架判定会产出 `trend of O → course O` 这种无意义模板。
                status, note, rewrite = DIRECT, "", ""

            cand_pos = WN_TO_POS.get(wn.pos_of(sid, cand), "") or pos
            cn = bind_cn(cand.lower(), cand_pos, query_segments, cn_of, ecdict)

            item: dict = {
                "lemma": cand,
                "pos": cand_pos,
                "status": status,
                "inPack": cand.lower() in in_pack,
            }
            if cn:
                item["cn"] = cn
            if note:
                item["note"] = note
            if rewrite:
                item["rewrite"] = rewrite
            candidates.append((RANK[status], item))

        if not candidates:
            continue
        candidates.sort(key=lambda pair: (-pair[0], pair[1]["lemma"]))

        group: dict = {"synset": synset_id, "gloss": gloss[:MAX_GLOSS]}
        frame = ("/".join(sorted(query_preps)) or canonical) if is_verb else ""
        if frame:
            group["frame"] = frame
        group["candidates"] = [item for _rank, item in candidates[:MAX_CANDIDATES]]
        groups.append(group)

        if len(groups) >= MAX_GROUPS:
            break

    return groups


# --------------------------------------------------------------------------- 主流程

def apply(
    chunks: list[tuple[Path, dict]],
    wn: WordNet,
    cn_of: dict[tuple[str, str], set[str]],
    ecdict: dict[str, dict[str, set[str]]],
    in_pack: set[str],
    dry: bool,
) -> dict:
    stats: Counter = Counter()
    per_status: Counter = Counter()
    for file, chunk in chunks:
        chunk["version"] = NEXT_VERSION
        for word in chunk.get("words", []):
            # 词级 synonyms 是 RC1 的载体，整体下线；同义只存在于义项上
            word.pop("synonyms", None)
            for sense in word.get("senses", []):
                stats["senses"] += 1
                groups = build_groups(word, sense, wn, cn_of, ecdict, in_pack)
                if not groups:
                    sense.pop("synonymGroups", None)
                    stats["empty_senses"] += 1
                    continue
                sense["synonymGroups"] = groups
                stats["senses_with_groups"] += 1
                stats["groups"] += len(groups)
                for group in groups:
                    for cand in group["candidates"]:
                        per_status[cand["status"]] += 1
                        stats["candidates"] += 1
                        if cand.get("cn"):
                            stats["candidates_with_cn"] += 1
        if not dry:
            file.write_text(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return {"stats": stats, "status": per_status}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def update_manifest(pack_dir: Path, manifest: dict) -> dict:
    manifest["version"] = NEXT_VERSION
    manifest["generatedAt"] = utc_now()
    manifest["synonymsNote"] = (
        "同义替换按 WordNet 义项（synset）分组：每个分组是该词一个词性下的一个具体义项，"
        "携带英文释义与搭配框架；候选按可用性分五态（可替换 / 框架一致 / 需改写 / 搭配不符 / 待验证），"
        "需改写的给出替换模板。同义严格等于同义集成员，上下位与类义不计入。"
    )
    # 许可文本里的版本号会随数据包升版失配，这里跟着改；同时按「name+url+license+used」
    # 去重：历史多次重跑 ETL 曾把 Wiktionary 条目重复写入 10 次。
    license_text = manifest.get("license") or ""
    manifest["license"] = re.sub(r"IELTS 数据包 v[\d.]+", f"IELTS 数据包 v{NEXT_VERSION}", license_text, count=1)

    unique: list[dict] = []
    seen: set[tuple] = set()
    for source in manifest.get("sources", []):
        key = (source.get("name"), source.get("url"), source.get("license"), source.get("used") or source.get("usedFor"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(source)
    unique = [s for s in unique if s.get("name") != "Open English WordNet"]
    manifest["sources"] = [
        {
            "name": "Open English WordNet",
            "version": "2021 (oewn:2021)",
            "url": "https://github.com/globalwordnet/english-wordnet",
            "license": "CC BY 4.0",
            "used": "义项（synset）划分、英文释义、例句、同义集成员、官方子类框架",
        },
        *unique,
    ]
    for entry in manifest.get("chunks", []):
        path = pack_dir / entry["file"]
        blob = path.read_bytes()
        entry["sha256"] = hashlib.sha256(blob).hexdigest()
        entry["bytes"] = len(blob)
    return manifest
    for entry in manifest.get("chunks", []):
        path = pack_dir / entry["file"]
        blob = path.read_bytes()
        entry["sha256"] = hashlib.sha256(blob).hexdigest()
        entry["bytes"] = len(blob)
    return manifest


def verify(pack_dir: Path) -> int:
    """交付校验：sha256、义项级结构、五态取值、候选合法性。"""
    errors: list[str] = []
    chunks, manifest = load_pack(pack_dir)
    for entry in manifest["chunks"]:
        digest = hashlib.sha256((pack_dir / entry["file"]).read_bytes()).hexdigest()
        if digest != entry["sha256"]:
            errors.append(f"{entry['file']}: sha256 与 manifest 不一致")

    counter: Counter = Counter()
    legacy = 0
    for _file, chunk in chunks:
        if chunk["version"] != manifest["version"]:
            errors.append(f"chunk {chunk['chunk']}: version 与 manifest 不一致")
        for word in chunk["words"]:
            if "synonyms" in word:
                legacy += 1
            for sense in word["senses"]:
                counter["senses"] += 1
                groups = sense.get("synonymGroups") or []
                if len(groups) > MAX_GROUPS:
                    errors.append(f"{word['lemma']}/{sense['id']}: 分组超过 {MAX_GROUPS}")
                for group in groups:
                    counter["groups"] += 1
                    if not group.get("synset") or not group.get("gloss"):
                        errors.append(f"{word['lemma']}/{sense['id']}: 分组缺 synset/gloss")
                    for cand in group.get("candidates", []):
                        counter["candidates"] += 1
                        counter[cand.get("status", "?")] += 1
                        if cand.get("status") not in RANK:
                            errors.append(f"{word['lemma']}: 非法状态 {cand.get('status')}")
                        if cand.get("lemma", "").lower() == word["lemma"].lower():
                            errors.append(f"{word['lemma']}: 候选包含本词")
                        if cand.get("status") == CONFLICT and not cand.get("note"):
                            errors.append(f"{word['lemma']}/{cand['lemma']}: 搭配不符缺理由")
                        if cand.get("status") == REWRITE and not cand.get("rewrite"):
                            errors.append(f"{word['lemma']}/{cand['lemma']}: 需改写缺模板")
                        if cand.get("cn") and ambiguous_cn(cand["cn"]):
                            errors.append(f"{word['lemma']}/{cand['lemma']}: 中文释义非义项级")
    if legacy:
        errors.append(f"{legacy} 个词仍带词级 synonyms（应为义项级）")

    print("== 义项级同义替换校验 ==")
    for key in ("senses", "groups", "candidates", DIRECT, INFERRED, REWRITE, CONFLICT, UNKNOWN):
        print(f"{key:11s} {counter[key]}")
    if errors:
        print(f"\n失败 {len(errors)} 项：")
        for err in errors[:40]:
            print(" -", err)
        return 1
    print("\n全部通过")
    return 0


def report_markdown(result: dict, chunks: list[tuple[Path, dict]]) -> str:
    stats: Counter = result["stats"]
    per_status: Counter = result["status"]
    total = stats["candidates"] or 1
    senses = stats["senses"] or 1
    usable = per_status[DIRECT] + per_status[INFERRED] + per_status[REWRITE]
    words = sum(len(c["words"]) for _f, c in chunks)

    lines = [
        "# 义项级同义替换质量报告（ETL 自动生成）",
        "",
        f"数据包版本：v{NEXT_VERSION}｜词条 {words}｜义项 {stats['senses']}",
        "",
        "由 `python scripts/etl_synonyms.py --report` 生成，重跑 ETL 会覆盖本文件。",
        "",
        "## 1. 覆盖",
        "",
        "| 指标 | 数值 |",
        "| :-- | --: |",
        f"| 有义项级同义词的义项 | {stats['senses_with_groups']} / {stats['senses']}"
        f"（{stats['senses_with_groups'] / senses:.1%}） |",
        f"| 义项分组数 | {stats['groups']} |",
        f"| 候选词条数 | {stats['candidates']} |",
        f"| 候选带义项级中文（中文义项段与卡片中文求交） | {stats['candidates_with_cn']}"
        f"（{stats['candidates_with_cn'] / max(1, total):.1%}） |",
        f"| 可用候选（可替换 + 框架一致 + 需改写） | {usable}（{usable / total:.1%}） |",
        "",
        "## 2. 五态分布",
        "",
        "| 状态 | 含义 | 数量 | 占比 |",
        "| :-- | :-- | --: | --: |",
        f"| 可替换 DIRECT | 语料与官方框架均无冲突 | {per_status[DIRECT]} | {per_status[DIRECT] / total:.1%} |",
        f"| 框架一致 INFERRED | 语料未覆盖该词形，官方框架与义项一致 | {per_status[INFERRED]} | {per_status[INFERRED] / total:.1%} |",
        f"| 需改写 REWRITE | 同义，但及物性或介词不同 | {per_status[REWRITE]} | {per_status[REWRITE] / total:.1%} |",
        f"| 搭配不符 CONFLICT | 该义项语料里它带别的介词 | {per_status[CONFLICT]} | {per_status[CONFLICT] / total:.1%} |",
        f"| 待验证 UNKNOWN | 语料与官方框架都不足以判断 | {per_status[UNKNOWN]} | {per_status[UNKNOWN] / total:.1%} |",
        "",
        "## 3. 标杆用例",
        "",
        "`consist` — 旧实现给 `lie`「躺着」/ `dwell`「居住」两个词级并列且缺 `comprise`。",
        "",
    ]

    for _file, chunk in chunks:
        for word in chunk["words"]:
            if word["lemma"] != "consist":
                continue
            for sense in word["senses"]:
                lines.append(f"`consist` · {sense['pos']} · 中文「{sense['cn']}」")
                lines.append("")
                for group in sense.get("synonymGroups") or []:
                    frame = f"｜框架 `{group['frame']}`" if group.get("frame") else ""
                    lines.append(f"- **{group['gloss']}**{frame}")
                    for cand in group["candidates"]:
                        note = f"：{cand['note']}" if cand.get("note") else ""
                        rewrite = f"｜模板 `{cand['rewrite']}`" if cand.get("rewrite") else ""
                        lines.append(f"  - `{cand['lemma']}` {cand['pos']} — {cand['status']}{note}{rewrite}")
                lines.append("")
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="义项级同义替换 ETL")
    parser.add_argument("--wn-db", default=os.environ.get("SYNONYM_WN_DB", str(ROOT / "scripts" / ".cache" / "wn.db")))
    parser.add_argument("--pack-dir", default=str(PACK_DIR))
    parser.add_argument("--dry", action="store_true", help="不写数据包，只打印统计")
    parser.add_argument("--report", default="", help="质量报告输出路径（markdown）")
    parser.add_argument("--verify-only", action="store_true", help="只校验已发布的数据包")
    parser.add_argument("--word", default="", help="只算一个词，打印分组便于人工核对")
    parser.add_argument("--ecdict", default=str(ROOT / "scripts" / ".cache" / "ecdict.csv"),
                        help="ECDICT CSV，用于库外候选的中文义项段（缺失则库外候选不带中文）")
    add_version_args(parser)
    args = parser.parse_args(argv)

    global NEXT_VERSION
    pack_dir = Path(args.pack_dir)
    if args.verify_only:
        return verify(pack_dir)
    NEXT_VERSION = resolve_version(pack_dir, args.version, args.bump, fallback=VERSION_FALLBACK)

    chunks, manifest = load_pack(pack_dir)
    lemmas = {w["lemma"].lower() for _f, c in chunks for w in c.get("words", [])}
    cn_of = cn_index(chunks)
    in_pack = set(lemmas)

    wn = WordNet(Path(args.wn_db))
    wn.locate(lemmas)
    wn.preload()

    # 库外候选的中文来源：只取候选词自身的词条释义，最终仍要与卡片中文求交（bind_cn）
    ecdict_lemmas = {m for sid in wn.synset_ids for m in wn.members.get(sid, [])} - lemmas
    ecdict = load_ecdict(Path(args.ecdict), ecdict_lemmas)

    if args.word:
        target = args.word.lower()
        for _file, chunk in chunks:
            for word in chunk["words"]:
                if word["lemma"].lower() != target:
                    continue
                for sense in word["senses"]:
                    groups = build_groups(word, sense, wn, cn_of, ecdict, in_pack)
                    print(json.dumps({"sense": sense["id"], "cn": sense["cn"], "groups": groups},
                                     ensure_ascii=False, indent=1))
        return 0

    result = apply(chunks, wn, cn_of, ecdict, in_pack, args.dry)
    stats: Counter = result["stats"]
    per_status: Counter = result["status"]
    total = stats["candidates"] or 1

    print(f"义项 {stats['senses']}：有分组 {stats['senses_with_groups']}，"
          f"分组 {stats['groups']}，候选 {stats['candidates']}")
    for status in (DIRECT, INFERRED, REWRITE, CONFLICT, UNKNOWN):
        print(f"  {status:9s} {per_status[status]:5d}  {per_status[status] / total:6.1%}")

    if not args.dry:
        manifest = update_manifest(pack_dir, manifest)
        (pack_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
        )
    if args.report:
        Path(args.report).write_text(report_markdown(result, chunks), encoding="utf-8")
        print(f"报告 → {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
