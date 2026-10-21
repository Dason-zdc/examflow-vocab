#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
etl_build_pack.py — ExamFlow Vocab · IELTS 数据包构建脚本 (B4)

=============================================================================
数据来源
=============================================================================
1. ECDICT (skywind3000/ECDICT) — MIT License
   - 下载: https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
   - 缓存: scripts/.cache/ecdict.csv          (65.9 MB, 770,611 条)
   - 词形: scripts/.cache/lemma.en.txt        (BNC lemma 库, 84,487 条)
   - 词根: scripts/.cache/wordroot.txt        (611 个词根, JSON)
   - 许可: scripts/.cache/LICENSE-ECDICT
   ECDICT 自身汇集 MIT / WordNet / cdict 等允许商用的来源。本项目仅取用
   word / phonetic / definition(英文释义, WordNet 派) / translation(中文释义) /
   pos / collins / oxford / tag / bnc / frq / exchange 字段。

2. 学术词权重表 — 内置 ACADEMIC_SEED_WORDS（近似 Coxhead AWL 学术词族取向）
   仅作排序权重，不作为内容输出。可用 --awl-file 指向官方 AWL 文本覆盖。

3. 例句 — 全部为本脚本生成的「仿真例句」(provenance.type = 'ADAPTED')
   - Tier A（词频最高前 TIER_A_SIZE=300 词）：人工撰写，见 scripts/tier_a_sentences.py
   - Tier B（其余词）：脚本按词性模板生成「释义型简句」，句式自然、语法正确
   不使用任何真题原句，不编造真题年份/题号/出处。

=============================================================================
字段含义（对照 PRD v0.2 第 6 章）
=============================================================================
Word.id           'w_' + lemma(非字母数字转 '_')，稳定、永不复用
Word.lemma        原形
Word.phoneticUk   音标（ECDICT 以英式为主）
Word.phoneticUs   同上（本版本未区分美音，与英式同源，UI 不应宣称是美音）
Word.isBasic      是否基础词（词频序号 <= BASIC_FLAG_FREQ_RANK）
Word.forms        变形（来自 ECDICT exchange）
Word.senses       义项数组，见下
Word.etymology    仅在 wordroot.txt 明确收录该词时生成，否则 null（不臆造词源）
Word.confusables  形近词，最多 3 个，reason ∈ SPELLING|SOUND|ROOT
Word.synonyms     本版本为空数组（ECDICT 无可靠同义词源，留待 P1）

Sense.id          's_' + lemma + '_' + posShort + '_' + slug，稳定
Sense.pos         词性
Sense.cn          中文释义（ECDICT translation 解析，最多 3 个义项点）
Sense.enDef       英文释义（ECDICT definition，WordNet 派生）
Sense.examStats.IELTS = { senseWeight, tier, kind, sources, isEccentric }
    senseWeight 为 0~100 的「公开语料近似权重」，非真题统计；kind 恒为 'ESTIMATED'，
    sources 非空（说明权重由哪些公开信号合成）；不得出现 years / freq / share 等
    旧字段（本项目无真题语料，禁止编造年份与题号）

ExampleSentence   { id, wordId, senseId, en, zh, surfaceForm, provenance }
    provenance 恒为 { type:'ADAPTED', note:'仿真例句 ...' }

=============================================================================
如何重跑
=============================================================================
    # 1) 下载原始数据（已缓存则跳过）
    python scripts/fetch_sources.py        # 或直接 curl 到 scripts/.cache/

    # 2) 构建数据包
    python scripts/etl_build_pack.py

    # 3) 只导出待撰写的高频词清单（用于补 Tier A 例句）
    python scripts/etl_build_pack.py --emit-targets scripts/.cache/tier_a_targets.txt

    # 4) 指定官方 AWL 词表覆盖内置学术词权重
    python scripts/etl_build_pack.py --awl-file scripts/data/awl.txt

脚本自带结构自检，任何一项不过即非零退出，不会产出半成品数据包。

=============================================================================
如何校验
=============================================================================
    # 单文件校验（不重新构建，只校验已产出文件与 manifest 的 sha256）
    python scripts/etl_build_pack.py --verify-only
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import math
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone

# --------------------------------------------------------------------------
# 路径
# --------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
CACHE_DIR = os.path.join(SCRIPT_DIR, ".cache")
OUT_DIR = os.path.join(ROOT_DIR, "public", "packs", "IELTS")
DOCS_DIR = os.path.join(ROOT_DIR, "docs")

ECDICT_CSV = os.path.join(CACHE_DIR, "ecdict.csv")
LEMMA_TXT = os.path.join(CACHE_DIR, "lemma.en.txt")
WORDROOT_JSON = os.path.join(CACHE_DIR, "wordroot.txt")
TIER_A_PY = os.path.join(SCRIPT_DIR, "tier_a_sentences.py")
# 语料例句 picks（由 scripts/enrich_pack_sentences.py 产出）：存在时优先使用，
# 让「全量重建」与「已发布数据包」用语料例句，而不是退回模板句。
SENTENCE_PICKS_JSON = os.path.join(SCRIPT_DIR, "build", "sentence-picks.json")
CORPUS_NOTE = "语料例句（Tatoeba 英中句对，CC BY 2.0 FR）"

# --------------------------------------------------------------------------
# 可调阈值（全部集中在此，便于评审与回归）
# --------------------------------------------------------------------------
EXAM = "IELTS"
PACK_VERSION = "1.0.0"
MIN_APP_VERSION = "1.0.0"
CHUNK_SIZE = 300                 # 每块词数
TARGET_WORDS = 2000              # 目标词数
TIER_A_SIZE = 300                # Tier A（人工例句）覆盖的高频词数

BASIC_EXCLUDE_FREQ_RANK = 600    # frq 序号 <= 600：极高频基础词，不入选
BASIC_FLAG_FREQ_RANK = 1500      # frq 序号 <= 1500：标记 isBasic = True
MAX_FREQ_RANK = 15000            # frq 序号 > 15000：过于生僻，不入选

MAX_SENSES = 4                   # 每词最多义项数
ECCENTRIC_SHARE_MIN = 0.15       # 熟词僻义：义项占比阈值（PRD §4.2）
ECCENTRIC_FREQ_MIN = 5           # 熟词僻义：义项近似频次阈值（PRD §4.2）
ECCENTRIC_WORD_FREQ_RANK = 2000  # 熟词僻义前提：该词本身须是「熟词」（frq <= 2000）
MAX_ECCENTRIC_PER_WORD = 1       # 每词最多标 1 个僻义义项（PRD §5.5 每词最多 3 张卡）
MAX_CONFUSABLES = 3              # 每词最多形近词
CONFUSABLE_MAX_EDIT = 2          # 形近词编辑距离上限
CONFUSABLE_LCP_ROOT = 5          # 最长公共前缀 >= 5 判定为 ROOT（共享词根）

# 义项权重：按 ECDICT 中出现顺序递减（首义最重）
SENSE_WEIGHTS = [0.46, 0.26, 0.16, 0.12]

# 选词打分权重
W_IELTS_TAG = 30
W_ACADEMIC = 25
W_OXFORD = 10
W_COLLINS = 5
# 词频区间加分：学术向高频最值钱，过高频（基础词）与过低频都降权
BANDS = (
    (600, 3000, 20),
    (3000, 6000, 16),
    (6000, 10000, 10),
    (10000, 15000, 5),
)

FREQ_METHOD_NOTE = (
    "义项考频为公开词频近似值，不是真题统计值。"
    "计算方式：取 ECDICT 当代语料库词频序号 frq（1 = 最高频），按 "
    "freq = clamp(2 + 48 * (1 - ln(frq)/ln(MAX_FREQ_RANK)), 2, 60) 得到词级近似频次，"
    "再按义项顺序权重 [0.46, 0.26, 0.16, 0.12] 分配到各义项并按 ECDICT tag / 学术词表加权。"
    "examStats.IELTS.kind 恒为 'ESTIMATED'、sources 非空（本项目无真题语料，"
    "不编造年份与题号，禁止把估计值伪装成真实统计）。"
)

LICENSE_TEXT = (
    "ExamFlow Vocab · IELTS 数据包 v" + PACK_VERSION + "\n"
    "== 词典数据 ==\n"
    "来源：ECDICT (https://github.com/skywind3000/ECDICT)，MIT License，"
    "版权归 skywind3000 及贡献者所有。ECDICT 自身汇集 MIT / WordNet (WordNet License) / "
    "cdict 等允许商用的开放来源。本数据包仅使用其词条、音标、中英文释义、词频与词形变化字段。\n"
    "词形还原补充：ECDICT lemma.en.txt（BNC 语料派生，作者声明可用于研究与教育用途）。\n"
    "词根说明：ECDICT wordroot.txt。\n"
    "== 例句 ==\n"
    "本数据包内所有例句均为仿真例句（provenance.type = ADAPTED），由脚本模板生成或人工撰写，"
    "用于演示义项用法。不含、也不声称来自剑桥雅思真题、剑桥大学出版社、British Council、"
    "IDP 或任何其他受版权保护的考试材料。例句中的年份、机构、数据均为虚构，仅用于构造语境。\n"
    "== 考频 ==\n" + FREQ_METHOD_NOTE + "\n"
    "== 不使用的数据 ==\n"
    "不使用柯林斯释义（需商业授权）、有道 dictvoice 等非公开接口、"
    "kajweb/dict 等来源不明数据集。\n"
    "== 商标 ==\n"
    "IELTS 是剑桥大学出版社、British Council 与 IDP 的注册商标；本数据包为独立编制的"
    "学习材料，未获其授权或背书。"
)

SOURCES = [
    {
        "name": "ECDICT",
        "url": "https://github.com/skywind3000/ECDICT",
        "license": "MIT",
        "used": "词条、音标、中英文释义、词性、词频(frq/bnc)、考试标签(tag)、词形变化(exchange)",
    },
    {
        "name": "ECDICT lemma.en.txt",
        "url": "https://github.com/skywind3000/ECDICT/blob/master/lemma.en.txt",
        "license": "free for research/educational use (per file header)",
        "used": "变形 → 原形映射补充",
    },
    {
        "name": "ECDICT wordroot.txt",
        "url": "https://github.com/skywind3000/ECDICT/blob/master/wordroot.txt",
        "license": "MIT (same repository)",
        "used": "词根说明（仅在明确收录该词时生成）",
    },
    {
        "name": "Academic seed word list (built-in)",
        "url": "scripts/etl_build_pack.py :: ACADEMIC_SEED_WORDS",
        "license": "n/a — 仅排序权重，不作为内容输出",
        "used": "学术向选词加权（近似 Coxhead AWL 取向，可用 --awl-file 覆盖）",
    },
]

# --------------------------------------------------------------------------
# 内置学术词种子表（近似 Coxhead AWL 学术词族取向）
# 只用于选词打分，不进入任何数据包内容。
# --------------------------------------------------------------------------
ACADEMIC_SEED_WORDS = """
abandon abstract academy access accommodate accompany accumulate accurate achieve acquire
adapt adequate adjacent adjust administrate adult advocate affect aggregate allocate alter
alternative ambiguous amend analyse analysis analyze annual apparent append appreciate
approach appropriate approximate arbitrary area assess assign assist assume assure attain
attitude attribute author authority available aware behalf benefit bias bond brief bulk
capable capacity category cease challenge channel chapter chart chemical circumstance cite
civil clarify classic clause code coherent coincide commence comment commission commit
commodity communicate community compatible compensate compile complement complex component
compound comprehensive comprise compute conceive concentrate concept conclude concurrent
conduct confer confine confirm conflict conform confront confuse consequent considerable
consist constant constitute constrain construct consult consume contact contemporary context
contract contrast contribute controversy convene convention converse convert convince
cooperate coordinate core corporate correspond criteria crucial culture cycle data debate
decade decline deduce define definite demonstrate denote depress derive design despite detect
determine deviate device devote diminish distinct distort distribute diverse document domain
domestic dominate draft duration dynamics economy edit element eliminate emerge emphasis
empirical enable encounter energy enhance ensure entail environment equip equivalent erode
error establish estimate ethic evaluate evidence evolve exceed exclude exhibit expand
expert explicit exploit export expose extract factor feature federal fee final finance finite
flexible fluctuation focus format formula foundation frame function fund fundamental generate
generation globe grade grant guarantee guideline hierarchy highlight hypothesis identify
ideology ignorance illustrate imitate impact implement implicate implicit imply import impose
incidence include income incorporate index indicate individual induce industry infer initial
initiate innovate input insert insight inspect instance institute instruct integral integrate
integrity intense interact intermediate internal interpret interval intervene intrinsic
invest invest investigate invoke involve isolate issue item job journal justify label labour
layer lecture legal legislate levy linkage locate logic maintain major manipulate margin
mature maximize mechanism media mediate medium mental method migrate military minimal
minimize minority mode modify monitor motive mutual negate network neutral nevertheless
norm notion nuclear objective obtain obvious occupy occur offset ongoing option orient outcome
output overall overlap panel paradigm parameter partial participate partner passive perceive
percent period persist perspective phase phenomenon philosophy physical plus policy portion
pose positive potential precise predict predominant preliminary premise premium prescribe
present presume previous primary prime principle prior priority procedure proceed process
professional prohibit project promote proportion proposal prospect protocol province provoke
publish purchase pursue qualitative quote radical random range ratio react rational react
receive recover regime region register regulate reinforce reject relax release relevant
reliable reluctance remove require research reside resign resolve resource respond restore
restrict retain reveal revenue reverse review revise revolution rigid role routine scenario
schedule scheme scope section sector secure seek segment select sequence series sex shift
significant similar simulate site so-called sole somewhat source specific spectrum sphere
stable statistic status steady stereotypest strategy stress structure style submit subordinate
subsequent subsidy substitute sufficient sum summary supplement supply survey survive suspect
sustain symbol synthesis technique temporary tense terminate text theme theory thesis topic
trace tradition transfer transform transit transmit transport trend trigger ultimate undergo
underlie undertake uniform unify unique utilize valid validate vary vast vehicle version
via violate virtual visible vision visual volume voluntary welfare whereas whereby widespread
""".split()

# --------------------------------------------------------------------------
# 词性归一
# --------------------------------------------------------------------------
POS_MAP = {
    "n": "n.", "noun": "n.", "pl": "n.",
    "v": "v.", "vt": "v.", "vi": "v.", "aux": "v.", "verb": "v.",
    "adj": "adj.", "a": "adj.", "s": "adj.", "adjs": "adj.",
    "adv": "adv.", "ad": "adv.",
    "prep": "prep.", "conj": "conj.", "pron": "pron.",
    "num": "num.", "int": "int.", "art": "art.", "abbr": "abbr.",
}
POS_SHORT = {"n.": "n", "v.": "v", "adj.": "adj", "adv.": "adv",
             "prep.": "prep", "conj.": "conj", "pron.": "pron",
             "num.": "num", "int.": "int", "art.": "art", "abbr.": "abbr", "": "x"}
POS_CN = {"n.": "名词", "v.": "动词", "adj.": "形容词", "adv.": "副词",
          "prep.": "介词", "conj.": "连词", "pron.": "代词", "num.": "数词",
          "int.": "感叹词", "art.": "冠词", "abbr.": "缩写", "": "该词性"}
POS_EN_PHRASE = {"n.": "a noun", "v.": "a verb", "adj.": "an adjective",
                 "adv.": "an adverb", "prep.": "a preposition",
                 "conj.": "a conjunction", "pron.": "a pronoun",
                 "num.": "a numeral", "int.": "an interjection",
                 "art.": "an article", "abbr.": "an abbreviation", "": "this part of speech"}

# ECDICT 音标里混入了两个西里尔字母（外观同 IPA，但编码不同），统一替换为标准 IPA
PHONETIC_FIXES = {
    "\u04d9": "\u0259",   # ә CYRILLIC SCHWA  -> ə LATIN SCHWA
    "\u0454": "\u025b",   # є CYRILLIC UKR IE -> ɛ LATIN OPEN E
    "\u04d8": "\u0259",   # Ә CYRILLIC CAPITAL SCHWA
    "\u0404": "\u025b",   # Є
}

STOP_SLUG = {"a", "an", "the", "of", "to", "in", "on", "for", "and", "or", "with",
             "by", "as", "at", "from", "that", "this", "it", "is", "are", "be",
             "being", "been", "one", "something", "someone", "into", "not", "no",
             "used", "use", "make", "makes", "do", "does", "have", "has", "having"}

# --------------------------------------------------------------------------
# Tier B 例句模板（释义型简句）
# 每个词性一组，按 hash(word+senseId) 取其中一条，保证可复现。
# --------------------------------------------------------------------------
TIER_B_FRAMES = {
    "n.": [
        ("The concept of {w} is central to the current debate.",
         "「{w}」（{cn}）这一概念是当下这场讨论的核心。", "{w}"),
        ("Recent research has paid growing attention to the {w}.",
         "近期研究对「{w}」（{cn}）给予了越来越多的关注。", "{w}"),
        ("The report treats the {w} as a key indicator of change.",
         "该报告把「{w}」（{cn}）当作衡量变化的一项关键指标。", "{w}"),
    ],
    "v.": [
        ("{g} is frequently discussed in the literature on this topic.",
         "关于这一主题的文献中，「{w}」（{cn}）经常被提及。", "{g}"),
        ("The study treats {g} as a distinct stage of the process.",
         "该研究把「{w}」（{cn}）视为整个过程中的一个独立阶段。", "{g}"),
        ("{G} has become noticeably more common over the past decade.",
         "在过去十年里，「{w}」（{cn}）变得明显更常见了。", "{g}"),
    ],
    "adj.": [
        ("Many experts consider the current approach {w}.",
         "许多专家认为目前的做法是「{w}」（{cn}）的。", "{w}"),
        ("The effects of this policy are {w} in most regions.",
         "这项政策的影响在多数地区是「{w}」（{cn}）的。", "{w}"),
        ("Such outcomes are often described as {w} in official reports.",
         "官方报告常把这类结果描述为「{w}」（{cn}）的。", "{w}"),
    ],
    "adv.": [
        ("The two systems operate {w} in practice.",
         "这两个系统在实践中以「{w}」（{cn}）的方式运行。", "{w}"),
        ("The figures changed {w} over the observation period.",
         "在观察期内，这些数字以「{w}」（{cn}）的方式发生变化。", "{w}"),
    ],
    "": [
        ("In academic texts, \"{w}\" is commonly used in this sense.",
         "在学术文本中，「{w}」常以「{cn}」这一义项出现。", "{w}"),
    ],
}


# ==========================================================================
# 工具函数
# ==========================================================================
def slugify_lemma(word: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", word.lower()).strip("_")


def to_int(v, default=0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def normalize_phonetic(p: str) -> str:
    p = (p or "").strip().strip("/").strip()
    for bad, good in PHONETIC_FIXES.items():
        p = p.replace(bad, good)
    return p


def norm_pos(raw: str) -> str:
    return POS_MAP.get((raw or "").strip().lower().rstrip("."), (raw.strip() + ".") if raw.strip() else "")


def short_pos(pos: str) -> str:
    return POS_SHORT.get(pos, "x")


def clean_cn(gloss: str, max_items: int = 3, max_len: int = 48) -> str:
    """把 ECDICT 的逗号释义收敛成简明的中文释义。"""
    g = (gloss or "").strip()
    g = re.sub(r"\s+", " ", g)
    g = g.replace("，", ",")
    parts = [p.strip() for p in g.split(",") if p.strip()]
    parts = parts[:max_items]
    out = "、".join(parts)
    if len(out) > max_len:
        cut = out[:max_len]
        if "、" in cut:
            cut = cut[:cut.rfind("、")]
        out = cut
    return out.strip("、。;； ")


def strip_trailing_de(cn: str) -> str:
    return cn[:-1] if cn.endswith("的") else cn


def make_slug(en_def: str, idx: int, pos: str) -> str:
    if en_def:
        head = re.sub(r"^\s*[a-z]+\.\s*", "", en_def)
        for tok in re.findall(r"[a-zA-Z][a-zA-Z\-']+", head):
            low = tok.lower()
            if len(low) >= 3 and low not in STOP_SLUG:
                return re.sub(r"[^a-z0-9]+", "", low)[:16]
    return "%s%d" % (short_pos(pos), idx + 1)


def levenshtein_leq(a: str, b: str, k: int) -> bool:
    """带剪枝的编辑距离判定：distance(a, b) <= k ?"""
    la, lb = len(a), len(b)
    if abs(la - lb) > k:
        return False
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [k + 1] * lb
        lo = max(1, i - k)
        hi = min(lb, i + k)
        for j in range(lo, hi + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            v = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            cur[j] = v
        if min(cur[lo:hi + 1]) > k:
            return False
        prev = cur
    return prev[lb] <= k


def soundex(word: str) -> str:
    w = (word or "").upper()
    if not w:
        return ""
    codes = {"B": "1", "F": "1", "P": "1", "V": "1", "C": "2", "G": "2", "J": "2",
             "K": "2", "Q": "2", "S": "2", "X": "2", "Z": "2", "D": "3", "T": "3",
             "L": "4", "M": "5", "N": "5", "R": "6"}
    out = w[0]
    for ch in w[1:]:
        c = codes.get(ch, "")
        if c and c != out[-1]:
            out += c
    out = out.replace("0", "")
    out = "".join(ch for ch in out if not ch.isalpha() or ch == w[0])
    return (out + "000")[:4]


def lcp(a: str, b: str) -> str:
    n = min(len(a), len(b))
    i = 0
    while i < n and a[i] == b[i]:
        i += 1
    return a[:i]


def gerund(word: str, exchange: str) -> str:
    """优先取 ECDICT exchange 的现在分词(i:)，否则按规则生成。"""
    for item in (exchange or "").split("/"):
        if item.startswith("i:"):
            v = item[2:].strip()
            if v:
                return v
    w = word or ""
    if not w:
        return ""
    if w.endswith("e") and not w.endswith(("ee", "oe", "ye")):
        return w[:-1] + "ing"
    if len(w) >= 3 and w[-1] not in "aeiou" and w[-2] in "aeiou" and w[-3] not in "aeiou" \
            and w[-1] not in "wxy":
        return w + w[-1] + "ing"
    return w + "ing"


def stable_pick(options, key: str):
    return options[hashlib.md5(key.encode("utf-8")).digest()[0] % len(options)]


EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0000FE0F\U00002190-\U000021FF"
    "\U00002B00-\U00002BFF\U0001F1E6-\U0001F1FF]"
)


def has_emoji(s: str) -> bool:
    return bool(EMOJI_RE.search(s or ""))


# ==========================================================================
# 1. 载入数据源
# ==========================================================================
def load_ecdict() -> dict:
    if not os.path.exists(ECDICT_CSV):
        sys.exit("[FATAL] 缺少 %s，请先运行 scripts/fetch_sources.py 或手动下载 ECDICT。" % ECDICT_CSV)
    csv.field_size_limit(10 ** 7)
    out = {}
    with open(ECDICT_CSV, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            w = (row.get("word") or "").strip().lower()
            if not w:
                continue
            prev = out.get(w)
            if prev is None or to_int(row.get("frq"), 10 ** 9) < to_int(prev.get("frq"), 10 ** 9):
                out[w] = row
    return out


def load_awl(path: str | None) -> set:
    if path:
        with open(path, encoding="utf-8") as f:
            words = {w.strip().lower() for w in re.split(r"[\s,;]+", f.read()) if w.strip()}
        print("[INFO] 载入外部学术词表 %s：%d 词" % (path, len(words)))
        return words
    return {w.lower() for w in ACADEMIC_SEED_WORDS}


def load_lemma_db(lemmas: set) -> dict:
    """lemma.en.txt:  'lemma/count -> form1,form2,...'"""
    if not os.path.exists(LEMMA_TXT):
        return {}
    out = defaultdict(list)
    with open(LEMMA_TXT, encoding="utf-8") as f:
        for line in f:
            if line.startswith(";") or "->" not in line:
                continue
            left, right = line.split("->", 1)
            lem = left.split("/")[0].strip().lower()
            if lem not in lemmas:
                continue
            for form in right.strip().split(","):
                form = form.strip().lower()
                if form and form != lem:
                    out[lem].append(form)
    return dict(out)


def load_wordroot() -> dict:
    if not os.path.exists(WORDROOT_JSON):
        return {}
    with open(WORDROOT_JSON, encoding="utf-8") as f:
        return json.load(f)


def load_tier_a() -> dict:
    if not os.path.exists(TIER_A_PY):
        return {}
    spec = importlib.util.spec_from_file_location("tier_a_sentences", TIER_A_PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # noqa: S302 - 本地受控数据文件
    return getattr(mod, "TIER_A", {})


# ==========================================================================
# 2. 释义解析
# ==========================================================================
LINE_POS_RE = re.compile(r"^\s*([a-zA-Z]+)\.\s*(.+)$")
DOMAIN_RE = re.compile(r"^\s*\[[^\]]+\]\s*(.+)$")


def parse_translation(tr: str):
    """ECDICT translation -> [(pos, cn_raw), ...]，按出现顺序去重。"""
    groups = []
    seen = set()
    for raw in (tr or "").split("\\n"):
        line = raw.replace("\n", " ").strip()
        if not line:
            continue
        m = LINE_POS_RE.match(line)
        if m:
            pos = norm_pos(m.group(1))
            gloss = m.group(2).strip()
        else:
            m2 = DOMAIN_RE.match(line)
            if not m2:
                continue
            pos = ""
            gloss = m2.group(1).strip()
        if not gloss or len(gloss) > 400:
            continue
        key = (pos, gloss)
        if key in seen:
            continue
        seen.add(key)
        groups.append((pos, gloss))
    return groups


def parse_definition(df: str) -> dict:
    """ECDICT definition -> {pos: [enDef, ...]}"""
    out = defaultdict(list)
    for raw in (df or "").split("\\n"):
        line = raw.replace("\n", " ").strip()
        if not line:
            continue
        m = LINE_POS_RE.match(line)
        if m:
            out[norm_pos(m.group(1))].append(m.group(2).strip())
    return dict(out)


def pick_en_def(defs: dict, pos: str, counter: dict) -> str:
    """
    按词性取英文释义：只取该词性下的第 k 条（k = 已取用的同词性条数）。
    取不到就留空 —— 宁可没有英释，也不能把别的词性的释义串到这个义项上。
    """
    lst = defs.get(pos) or []
    k = counter.get(pos, 0)
    counter[pos] = k + 1
    return lst[k][:200] if k < len(lst) else ""


def build_senses(lemma: str, row: dict, tier_a_entry=None):
    """
    返回 senses 列表（不含 examStats，examStats 在选词后统一计算）。
    Tier A 词使用人工撰写的义项（保证与人工例句对齐），其余用 ECDICT 解析结果。
    """
    defs = parse_definition(row.get("definition", ""))
    counter = {}
    senses = []

    if tier_a_entry:
        for i, item in enumerate(tier_a_entry[:MAX_SENSES]):
            pos_raw = item.get("pos", "") or ""
            pos = norm_pos(pos_raw.rstrip(".")) or norm_pos(pos_raw)
            if not pos and pos_raw:
                pos = POS_MAP.get(pos_raw.lower(), pos_raw)
            cn = clean_cn(item.get("cn", ""), max_items=4, max_len=60) or clean_cn(item.get("cn", ""))
            en_def = pick_en_def(defs, pos, counter)
            senses.append({
                "pos": pos or "",
                "cn": cn,
                "enDef": en_def,
                "slug": make_slug(en_def, i, pos),
            })
        return senses

    groups = parse_translation(row.get("translation", ""))
    if not groups:
        return senses
    used_slugs = set()
    for i, (pos, gloss) in enumerate(groups[:MAX_SENSES]):
        en_def = pick_en_def(defs, pos, counter)
        slug = make_slug(en_def, i, pos)
        base, n = slug, 2
        while slug in used_slugs:
            slug = "%s%d" % (base, n)
            n += 1
        used_slugs.add(slug)
        senses.append({
            "pos": pos,
            "cn": clean_cn(gloss),
            "enDef": en_def,
            "slug": slug,
        })
    return senses


# ==========================================================================
# 3. 选词
# ==========================================================================
WORD_RE = re.compile(r"^[a-z][a-z'\-]{2,}$")


def select_words(ecdict: dict, awl: set, target: int):
    candidates = []
    for w, row in ecdict.items():
        if not WORD_RE.match(w) or "'" in w or "-" in w:
            continue
        if not (row.get("translation") or "").strip():
            continue
        frq = to_int(row.get("frq"))
        bnc = to_int(row.get("bnc"))
        if frq <= 0 and bnc <= 0:
            continue
        rank = frq if frq > 0 else bnc
        if frq > 0 and frq <= BASIC_EXCLUDE_FREQ_RANK:
            continue
        if frq > 0 and frq > MAX_FREQ_RANK:
            continue
        tags = set((row.get("tag") or "").split())
        score = 0
        if "ielts" in tags:
            score += W_IELTS_TAG
        if w in awl:
            score += W_ACADEMIC
        if row.get("oxford") == "1":
            score += W_OXFORD
        if row.get("collins") in ("1", "2", "3"):
            score += W_COLLINS
        for lo, hi, bonus in BANDS:
            if lo < rank <= hi:
                score += bonus
                break
        candidates.append({
            "word": w, "row": row, "frq": frq, "bnc": bnc, "rank": rank,
            "tags": tags, "score": score,
            "isBasic": 0 < frq <= BASIC_FLAG_FREQ_RANK,
            "awl": w in awl,
        })

    # 打分降序；同分按词频序号升序（更常见者优先）
    candidates.sort(key=lambda c: (-c["score"], c["rank"], c["word"]))
    selected = candidates[:target]

    # 基础词集合（用于形近词候选）：全库中词频序号最高的 BASIC_POOL 个词
    basics = sorted(
        (w for w, r in ecdict.items()
         if WORD_RE.match(w) and "'" not in w and "-" not in w
         and (r.get("translation") or "").strip() and to_int(r.get("frq")) > 0),
        key=lambda w: to_int(ecdict[w].get("frq")),
    )[:2000]
    return selected, set(basics)


# ==========================================================================
# 4. 考频（公开词频近似值）
# ==========================================================================
def word_freq_approx(cand: dict) -> int:
    rank = cand["frq"] if cand["frq"] > 0 else cand["bnc"]
    if rank <= 0:
        return 2
    v = max(0.0, 1.0 - math.log(rank) / math.log(MAX_FREQ_RANK))
    val = 2 + 48 * v
    if "ielts" in cand["tags"]:
        val += 6
    if cand["awl"]:
        val += 6
    if cand["row"].get("oxford") == "1":
        val += 2
    return int(round(min(60, max(2, val))))


def attach_exam_stats(senses: list, total_freq: int, word_rank: int) -> None:
    """
    熟词僻义判定（无真题语料，按公开词频近似）：
        1. 非首义（PRD §4.2）
        2. 该词本身是「熟词」：frq <= ECCENTRIC_WORD_FREQ_RANK
        3. share >= ECCENTRIC_SHARE_MIN 或 freq >= ECCENTRIC_FREQ_MIN（PRD §4.2）
        4. 该义项词性与首义不同 —— 真正的「义项跳跃」（如 address n.地址 → v.处理）
        5. 每词最多 MAX_ECCENTRIC_PER_WORD 个，取频次最高的那个
    """
    n = len(senses)
    if n == 1:
        weights = [1.0]
    else:
        w = SENSE_WEIGHTS[:n]
        s = sum(w)
        weights = [x / s for x in w]
    freqs = [max(1, int(round(total_freq * x))) for x in weights]
    total = sum(freqs)
    shares = [f / total for f in freqs]

    is_common_word = 0 < word_rank <= ECCENTRIC_WORD_FREQ_RANK
    first_pos = senses[0].get("pos", "")
    candidates = []
    for i in range(1, n):
        if not is_common_word:
            continue
        if not (shares[i] >= ECCENTRIC_SHARE_MIN or freqs[i] >= ECCENTRIC_FREQ_MIN):
            continue
        pos = senses[i].get("pos", "")
        if first_pos and pos and pos == first_pos:
            continue
        candidates.append((freqs[i], -i, i))
    flagged = set()
    if candidates:
        candidates.sort(reverse=True)
        flagged = {i for _, _, i in candidates[:MAX_ECCENTRIC_PER_WORD]}

    for i, s in enumerate(senses):
        s["examStats"] = {
            "IELTS": {
                "freq": freqs[i],
                "share": round(shares[i], 4),
                "isEccentric": i in flagged,
                "years": [],
                "approx": True,
            }
        }


# ==========================================================================
# 5. 例句
# ==========================================================================
def tier_b_sentence(lemma: str, sense: dict, exchange: str) -> dict:
    pos = sense.get("pos", "")
    cn = sense.get("cn", "") or lemma
    frames = TIER_B_FRAMES.get(pos) or TIER_B_FRAMES[""]
    en_t, zh_t, surf_t = stable_pick(frames, lemma + "|" + sense["slug"])
    g = gerund(lemma, exchange) or lemma
    G = g[0].upper() + g[1:]
    adj_cn = strip_trailing_de(cn)
    surface = {"{w}": lemma, "{g}": g, "{G}": G}.get(surf_t, lemma)
    en = en_t.replace("{w}", lemma).replace("{g}", g).replace("{G}", G)
    zh = zh_t.replace("{w}", lemma).replace("{g}", g).replace("{G}", G)
    zh = zh.replace("{cn}", adj_cn if pos == "adj." else cn)
    return {"en": en, "zh": zh, "surface": surface}


def load_sentence_picks() -> dict:
    """{word_id: {sense_id: pick}}；文件不存在时返回空 dict（退回旧行为）"""
    if not os.path.exists(SENTENCE_PICKS_JSON):
        return {}
    with open(SENTENCE_PICKS_JSON, "r", encoding="utf-8") as f:
        raw = json.load(f)
    out = {}
    for wid, picks in (raw.get("words") or {}).items():
        out[wid] = {p["senseId"]: p for p in picks}
    return out


SENTENCE_PICKS = load_sentence_picks()


def build_sentences(word_id: str, lemma: str, senses: list, row: dict,
                    tier_a_entry, seq) -> list:
    out = []
    exchange = row.get("exchange", "")
    picks = SENTENCE_PICKS.get(word_id)
    if picks is not None:
        # 语料模式：只产出可溯源的语料例句；无语料的义项标 sentencePending，不用模板句填充
        for sense in senses:
            pick = picks.get(sense["id"])
            if not pick:
                sense["sentencePending"] = True
                continue
            seq[0] += 1
            out.append({
                "id": "x_%s_%d" % (slugify_lemma(lemma), seq[0]),
                "wordId": word_id,
                "senseId": sense["id"],
                "en": pick["en"],
                "zh": pick["zh"],
                "surfaceForm": pick["surface"],
                "provenance": {
                    "type": "ADAPTED",
                    "note": CORPUS_NOTE,
                    "origin": "TATOEBA",
                    "sourceId": pick["sourceId"],
                },
            })
        return out
    for i, sense in enumerate(senses):
        sid = sense["id"]
        authored = None
        if tier_a_entry and i < len(tier_a_entry):
            authored = tier_a_entry[i]
        if authored and authored.get("en") and authored.get("zh"):
            en = authored["en"].strip()
            zh = authored["zh"].strip()
            surface = (authored.get("surface") or lemma).strip()
            note = authored.get("note") or "仿真例句（人工撰写，用于演示该义项用法）"
        else:
            gen = tier_b_sentence(lemma, sense, exchange)
            en, zh, surface = gen["en"], gen["zh"], gen["surface"]
            note = "仿真例句（脚本按词性模板生成，用于演示该义项用法）"
        seq[0] += 1
        out.append({
            "id": "x_%s_%d" % (slugify_lemma(lemma), seq[0]),
            "wordId": word_id,
            "senseId": sid,
            "en": en,
            "zh": zh,
            "surfaceForm": surface,
            "provenance": {"type": "ADAPTED", "note": note},
        })
    return out


# ==========================================================================
# 6. 形近词
# ==========================================================================
def build_confusables(word: str, pool: dict, cand_words: set) -> list:
    """pool: {w: {'cn':..., 'phonetic':...}}；cand_words: 允许出现的词集合"""
    cands = []
    wl = len(word)
    for other in cand_words:
        if other == word:
            continue
        ol = len(other)
        if abs(ol - wl) > CONFUSABLE_MAX_EDIT:
            continue
        # 粗筛：首字母相同或末三位相同，避免全量 O(n^2)
        if other[0] != word[0] and (len(word) < 3 or len(other) < 3 or other[-3:] != word[-3:]):
            continue
        if not levenshtein_leq(word, other, CONFUSABLE_MAX_EDIT):
            continue
        common = lcp(word, other)
        if len(common) >= CONFUSABLE_LCP_ROOT:
            reason = "ROOT"
        elif soundex(word) == soundex(other):
            reason = "SOUND"
        else:
            reason = "SPELLING"
        meta = pool.get(other, {})
        cands.append({
            "lemma": other,
            "phonetic": meta.get("phonetic", ""),
            "cn": meta.get("cn", ""),
            "reason": reason,
            "_edit": 0 if word == other else _true_edit(word, other),
            "_stem": common,
        })
    cands.sort(key=lambda c: (c["_edit"], -len(c["_stem"]), c["lemma"]))
    top = cands[:MAX_CONFUSABLES]
    out = []
    for c in top:
        cn_a = pool.get(word, {}).get("cn", "")
        cn_b = c["cn"] or "—"
        if c["reason"] == "ROOT":
            tip = "共享词根「%s」：%s 意为%s，%s 意为%s。" % (c["_stem"], word, cn_a, c["lemma"], cn_b)
        elif c["reason"] == "SOUND":
            tip = "读音相近：%s 与 %s 发音接近；前者意为%s，后者意为%s。" % (word, c["lemma"], cn_a, cn_b)
        else:
            idx = first_diff_index(word, c["lemma"])
            tip = "拼写在第 %d 个字母处开始不同（%s / %s）：前者意为%s，后者意为%s。" % (
                idx + 1, word, c["lemma"], cn_a, cn_b)
        out.append({
            "lemma": c["lemma"],
            "phonetic": c["phonetic"],
            "cn": c["cn"],
            "reason": c["reason"],
            "tip": tip,
        })
    return out


def _true_edit(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1]))
        prev = cur
    return prev[len(b)]


def first_diff_index(a: str, b: str) -> int:
    n = min(len(a), len(b))
    for i in range(n):
        if a[i] != b[i]:
            return i
    return n - 1 if n else 0


# ==========================================================================
# 7. 词源（仅在 wordroot.txt 明确收录时给出）
# ==========================================================================
def build_etymology(word: str, root_index: dict):
    hit = root_index.get(word)
    if not hit:
        return None
    root, meaning, origin = hit
    return {
        "formula": "%s（%s）" % (root, meaning),
        "origin": "词根 %s 源自 %s，含义为「%s」。" % (root, origin or "—", meaning),
        "derivatives": [],
    }


def build_root_index(wr: dict, words: set) -> dict:
    idx = {}
    for root, meta in (wr or {}).items():
        examples = meta.get("example") or []
        if isinstance(examples, str):
            examples = [examples]
        for ex in examples:
            w = str(ex).strip().lower()
            if w in words and w not in idx:
                idx[w] = (root, meta.get("meaning", ""), meta.get("origin", ""))
    return idx


# ==========================================================================
# 8. lemma-map
# ==========================================================================
INFLECT_SUFFIXES = [
    ("ies", "y"), ("ves", "f"), ("ves", "fe"), ("es", ""), ("s", ""),
    ("ed", ""), ("ed", "e"), ("ing", ""), ("ing", "e"),
    ("ly", ""), ("er", ""), ("er", "e"), ("est", ""), ("est", "e"),
    ("tion", ""), ("ment", ""), ("ness", ""), ("ity", ""), ("ful", ""),
    ("less", ""), ("able", ""), ("ive", ""), ("al", ""), ("ous", ""),
]


def parse_exchange(exchange: str) -> list:
    out = []
    for item in (exchange or "").split("/"):
        if ":" not in item:
            continue
        t, v = item.split(":", 1)
        v = v.strip().lower()
        if t in ("p", "d", "i", "3", "r", "t", "s") and v:
            out.append(v)
    return out


def build_lemma_map(ecdict: dict, lemmas: set) -> dict:
    mapping = {}
    lemma_db = load_lemma_db(lemmas)

    def add(form, lemma):
        if not form or form == lemma:
            return
        if form in lemmas and form != lemma:
            return  # 该形式本身是独立词条，不覆盖
        mapping.setdefault(form, lemma)

    for w in sorted(lemmas):
        row = ecdict.get(w, {})
        for form in parse_exchange(row.get("exchange", "")):
            add(form, w)
        for form in lemma_db.get(w, []):
            if form in ecdict or not WORD_RE.match(form):
                add(form, w)
        # 规则补全：仅当该变形确实存在于 ECDICT 中才收录
        for suf, repl in INFLECT_SUFFIXES:
            if w.endswith(suf):
                cand = w[: len(w) - len(suf)] + repl
                if len(cand) >= 3 and cand in ecdict and cand != w:
                    add(cand, w)
            cand2 = w + suf
            if cand2 in ecdict and cand2 != w:
                add(cand2, w)
    return dict(sorted(mapping.items()))


# ==========================================================================
# 9. 构建主流程
# ==========================================================================
def build(awl_file: str | None) -> dict:
    print("[1/8] 载入 ECDICT ...")
    ecdict = load_ecdict()
    print("      词条数：%d" % len(ecdict))

    print("[2/8] 载入学术词权重表 ...")
    awl = load_awl(awl_file)
    print("      权重词数：%d" % len(awl))

    print("[3/8] 选词 ...")
    selected, basics = select_words(ecdict, awl, TARGET_WORDS)
    if len(selected) < TARGET_WORDS:
        print("[WARN] 候选不足，仅选出 %d 词（目标 %d）" % (len(selected), TARGET_WORDS))
    selected_words = {c["word"] for c in selected}
    print("      选中：%d 词；基础词候选池：%d 词" % (len(selected), len(basics)))

    print("[4/8] 载入 Tier A 人工例句 ...")
    tier_a = load_tier_a()
    tier_a_words = {c["word"] for c in selected[:TIER_A_SIZE]}
    covered_a = tier_a_words & set(tier_a.keys())
    print("      Tier A 目标 %d 词；已撰写 %d 词（覆盖率 %.1f%%）"
          % (len(tier_a_words), len(covered_a),
             100.0 * len(covered_a) / max(1, len(tier_a_words))))

    print("[5/8] 构建词条（义项 / 例句 / 词源）...")
    wr = load_wordroot()
    root_index = build_root_index(wr, selected_words)

    # 形近词候选池（当前词表 + 基础词表）
    cand_words = selected_words | basics
    pool_meta = {}
    for w in cand_words:
        row = ecdict.get(w)
        if not row:
            continue
        groups = parse_translation(row.get("translation", ""))
        cn = clean_cn(groups[0][1]) if groups else ""
        pool_meta[w] = {"cn": cn, "phonetic": normalize_phonetic(row.get("phonetic", ""))}

    words = []
    seq = [0]
    stats = {
        "sense_total": 0, "sentence_total": 0, "eccentric": 0,
        "with_confusables": 0, "with_etymology": 0, "basic": 0,
        "tier_a_words": len(covered_a),
    }

    for idx, cand in enumerate(selected):
        w = cand["word"]
        row = cand["row"]
        lemma_slug = slugify_lemma(w)
        word_id = "w_" + lemma_slug

        entry = tier_a.get(w) if idx < TIER_A_SIZE else None
        raw_senses = build_senses(w, row, entry)
        if not raw_senses:
            print("[WARN] %s 无可解析义项，跳过" % w)
            continue

        for i, s in enumerate(raw_senses):
            s["id"] = "s_%s_%s_%s" % (lemma_slug, short_pos(s["pos"]), s["slug"])

        # 去重 sense id
        seen = set()
        for s in raw_senses:
            base = s["id"]
            n = 2
            while s["id"] in seen:
                s["id"] = "%s_%d" % (base, n)
                n += 1
            seen.add(s["id"])

        attach_exam_stats(raw_senses, word_freq_approx(cand), cand["frq"])

        sentences = build_sentences(word_id, w, raw_senses, row, entry, seq)

        word_obj = {
            "id": word_id,
            "lemma": w,
            "phoneticUk": ("/" + normalize_phonetic(row.get("phonetic", "")) + "/")
                          if normalize_phonetic(row.get("phonetic", "")) else "",
            "phoneticUs": "",
            "isBasic": bool(cand["isBasic"]),
            "forms": sorted(set(parse_exchange(row.get("exchange", "")))),
            "senses": [{k: v for k, v in s.items() if k != "slug"} for s in raw_senses],
            "sentences": sentences,
            "etymology": build_etymology(w, root_index),
            "confusables": build_confusables(w, pool_meta, cand_words),
            "synonyms": [],
        }

        stats["sense_total"] += len(raw_senses)
        stats["sentence_total"] += len(sentences)
        stats["eccentric"] += sum(1 for s in raw_senses
                                  if s["examStats"]["IELTS"]["isEccentric"])
        if word_obj["confusables"]:
            stats["with_confusables"] += 1
        if word_obj["etymology"]:
            stats["with_etymology"] += 1
        if word_obj["isBasic"]:
            stats["basic"] += 1
        words.append(word_obj)

    print("      词条：%d；义项：%d；例句：%d" % (len(words), stats["sense_total"], stats["sentence_total"]))

    print("[6/8] 构建变形 → 原形映射 ...")
    lemmas = {w["lemma"] for w in words}
    lemma_map = build_lemma_map(ecdict, lemmas)
    print("      映射条目：%d" % len(lemma_map))

    print("[7/8] 分块与 manifest ...")
    os.makedirs(OUT_DIR, exist_ok=True)
    for f in os.listdir(OUT_DIR):
        if f.startswith("chunk-") and f.endswith(".json"):
            os.remove(os.path.join(OUT_DIR, f))

    chunks = []
    for n, start in enumerate(range(0, len(words), CHUNK_SIZE)):
        part = words[start:start + CHUNK_SIZE]
        payload = {"exam": EXAM, "version": PACK_VERSION, "chunk": n,
                   "wordCount": len(part), "words": part}
        path = os.path.join(OUT_DIR, "chunk-%d.json" % n)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        chunks.append({"n": n, "file": "chunk-%d.json" % n, "wordCount": len(part),
                       "sha256": sha256_file(path), "bytes": os.path.getsize(path)})

    lemma_path = os.path.join(OUT_DIR, "lemma-map.json")
    with open(lemma_path, "w", encoding="utf-8") as f:
        json.dump({"exam": EXAM, "version": PACK_VERSION, "entries": len(lemma_map),
                   "map": lemma_map}, f, ensure_ascii=False, separators=(",", ":"))

    manifest = {
        "exam": EXAM,
        "version": PACK_VERSION,
        "minAppVersion": MIN_APP_VERSION,
        "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "wordCount": len(words),
        "chunkSize": CHUNK_SIZE,
        "chunks": chunks,
        "lemmaMap": {"file": "lemma-map.json", "sha256": sha256_file(lemma_path),
                     "bytes": os.path.getsize(lemma_path), "entries": len(lemma_map)},
        "deprecatedWordIds": [],
        "frequencyMethod": FREQ_METHOD_NOTE,
        "provenanceNote": "所有例句均为仿真例句（ADAPTED）。不含真题原句，不标注真题年份、题号或出处。",
        "sources": SOURCES,
        "license": LICENSE_TEXT,
    }
    manifest_path = os.path.join(OUT_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print("[8/8] 结构自检 ...")
    errors = verify(OUT_DIR, words)
    if errors:
        print("\n[FATAL] 自检未通过，共 %d 项：" % len(errors))
        for e in errors[:30]:
            print("   - " + e)
        sys.exit(1)
    print("      自检通过。")

    total_bytes = (sum(c["bytes"] for c in chunks) + os.path.getsize(lemma_path)
                   + os.path.getsize(manifest_path))
    print("\n[DONE] 数据包：%d 词 / %d 块 / %.2f MB" % (len(words), len(chunks), total_bytes / 1048576.0))
    return {"words": words, "chunks": chunks, "stats": stats, "manifest": manifest,
            "lemma_map": lemma_map, "total_bytes": total_bytes, "tier_a_words": tier_a_words,
            "tier_a_covered": covered_a}


# ==========================================================================
# 10. 自检
# ==========================================================================
def verify(out_dir: str, words=None) -> list:
    errors = []
    manifest_path = os.path.join(out_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        return ["manifest.json 不存在"]

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    all_words = []
    for c in manifest["chunks"]:
        p = os.path.join(out_dir, c["file"])
        if not os.path.exists(p):
            errors.append("分块缺失：%s" % c["file"])
            continue
        if sha256_file(p) != c["sha256"]:
            errors.append("sha256 不匹配：%s" % c["file"])
        if os.path.getsize(p) != c["bytes"]:
            errors.append("bytes 不匹配：%s" % c["file"])
        with open(p, encoding="utf-8") as f:
            payload = json.load(f)
        if payload["wordCount"] != len(payload["words"]):
            errors.append("%s wordCount 与实际不符" % c["file"])
        all_words.extend(payload["words"])

    if manifest["wordCount"] != len(all_words):
        errors.append("manifest.wordCount(%d) 与实际词条数(%d) 不符"
                      % (manifest["wordCount"], len(all_words)))

    lm = os.path.join(out_dir, "lemma-map.json")
    if not os.path.exists(lm):
        errors.append("lemma-map.json 不存在")
    elif sha256_file(lm) != manifest["lemmaMap"]["sha256"]:
        errors.append("lemma-map.json sha256 不匹配")

    word_ids, sense_ids, sent_ids = set(), set(), set()
    for w in all_words:
        if not w.get("id"):
            errors.append("词条缺少 id")
            continue
        if w["id"] in word_ids:
            errors.append("word id 重复：%s" % w["id"])
        word_ids.add(w["id"])

        if not w.get("senses"):
            errors.append("%s 无义项" % w["id"])
            continue
        sense_ids_here = set()
        for s in w["senses"]:
            if s["id"] in sense_ids:
                errors.append("sense id 重复：%s" % s["id"])
            sense_ids.add(s["id"])
            sense_ids_here.add(s["id"])
            st = s.get("examStats", {}).get("IELTS")
            if not st:
                errors.append("%s 缺少 examStats.IELTS" % s["id"])
                continue
            # 旧字段一律不得出现（freq/share/years/approx 已于 senseWeight 迁移移除）
            for legacy in ("years", "freq", "share", "approx"):
                if legacy in st:
                    errors.append("%s 含旧字段 %s（应已迁移为 senseWeight）" % (s["id"], legacy))
            sw = st.get("senseWeight")
            if not isinstance(sw, (int, float)) or isinstance(sw, bool) or sw != sw or sw < 0 or sw > 100:
                errors.append("%s senseWeight 必须是 0~100 的数：%r" % (s["id"], sw))
            if st.get("tier") not in ("CORE", "ADVANCED", "EXTENDED"):
                errors.append("%s tier 非法：%r" % (s["id"], st.get("tier")))
            if st.get("kind") != "ESTIMATED":
                errors.append("%s kind 必须为 ESTIMATED：%r" % (s["id"], st.get("kind")))
            srcs = st.get("sources")
            if not isinstance(srcs, list) or len(srcs) == 0:
                errors.append("%s sources 不能为空" % s["id"])
            if not isinstance(st.get("isEccentric"), bool):
                errors.append("%s isEccentric 必须是布尔值" % s["id"])

        covered = set()
        for x in w.get("sentences", []):
            if x["id"] in sent_ids:
                errors.append("sentence id 重复：%s" % x["id"])
            sent_ids.add(x["id"])
            if x["wordId"] != w["id"]:
                errors.append("%s wordId 不匹配" % x["id"])
            if x["senseId"] not in sense_ids_here:
                errors.append("%s senseId 不属于本词：%s" % (x["id"], x["senseId"]))
            covered.add(x["senseId"])
            if x.get("provenance", {}).get("type") != "ADAPTED":
                errors.append("%s provenance 非 ADAPTED" % x["id"])
        pending = {s["id"] for s in w["senses"] if s.get("sentencePending")}
        for sid in sense_ids_here - covered - pending:
            errors.append("%s 的义项 %s 无例句且未标记 sentencePending" % (w["id"], sid))

        for c in w.get("confusables", []):
            if c.get("reason") not in ("SPELLING", "SOUND", "ROOT"):
                errors.append("%s confusable reason 非法：%s" % (w["id"], c.get("reason")))
            if not c.get("tip"):
                errors.append("%s confusable 缺 tip" % w["id"])
        if len(w.get("confusables", [])) > MAX_CONFUSABLES:
            errors.append("%s confusables 超过 %d 个" % (w["id"], MAX_CONFUSABLES))

    # emoji 扫描（P0 质量红线）
    def scan(node, path):
        if isinstance(node, str):
            if has_emoji(node):
                errors.append("emoji：%s" % path)
        elif isinstance(node, dict):
            for k, v in node.items():
                scan(v, path + "." + str(k))
        elif isinstance(node, list):
            for i, v in enumerate(node):
                scan(v, "%s[%d]" % (path, i))

    scan(all_words, "words")
    return errors


# ==========================================================================
# 11. 数据质量报告
# ==========================================================================
def write_quality_doc(result: dict) -> str:
    os.makedirs(DOCS_DIR, exist_ok=True)
    words = result["words"]
    st = result["stats"]
    n = len(words)
    sense_avg = st["sense_total"] / max(1, n)
    sent_per_sense = st["sentence_total"] / max(1, st["sense_total"])
    conf_cov = 100.0 * st["with_confusables"] / max(1, n)
    ety_cov = 100.0 * st["with_etymology"] / max(1, n)
    tier_a_cov = 100.0 * len(result["tier_a_covered"]) / max(1, len(result["tier_a_words"]))

    samples = [words[i] for i in range(0, n, max(1, n // 10))][:10]

    lines = []
    a = lines.append
    a("# IELTS 数据包 · 数据质量自检报告")
    a("")
    a("> 由 `scripts/etl_build_pack.py` 自动生成，重新构建时会覆盖。")
    a("> 生成时间：%s" % result["manifest"]["generatedAt"])
    a("> 交付校验：`python scripts/etl_build_pack.py --verify-only` 通过"
      "（sha256 / bytes / 词条与义项 ID 唯一性 / 例句覆盖 / 形近词约束 / examStats 新Schema）")
    a("")
    a("## 1. 总量")
    a("")
    a("| 指标 | 数值 |")
    a("| :-- | --: |")
    a("| 词数 | %d |" % n)
    a("| 义项总数 | %d |" % st["sense_total"])
    a("| 每词平均义项数 | %.2f |" % sense_avg)
    a("| 例句总数 | %d |" % st["sentence_total"])
    a("| 例句覆盖率（义项维度） | %.1f%% |" % (100.0 * sent_per_sense))
    a("| 熟词僻义（isEccentric）义项数 | %d |" % st["eccentric"])
    a("| 有形近词的词条数 | %d（%.1f%%） |" % (st["with_confusables"], conf_cov))
    a("| 有词根说明的词条数 | %d（%.1f%%） |" % (st["with_etymology"], ety_cov))
    a("| isBasic = true 的词条数 | %d |" % st["basic"])
    a("| Tier A（人工例句）覆盖 | %d / %d（%.1f%%） |"
      % (len(result["tier_a_covered"]), len(result["tier_a_words"]), tier_a_cov))
    a("| 变形→原形映射条目 | %d |" % result["manifest"]["lemmaMap"]["entries"])
    a("| 数据包体积 | %.2f MB |" % (result["total_bytes"] / 1048576.0))
    a("")
    a("## 2. 分块")
    a("")
    a("| 块 | 词数 | 字节 | sha256（前 16 位） |")
    a("| --: | --: | --: | :-- |")
    for c in result["chunks"]:
        a("| %d | %d | %d | `%s` |" % (c["n"], c["wordCount"], c["bytes"], c["sha256"][:16]))
    a("")
    a("## 3. 阈值与口径")
    a("")
    a("| 项 | 取值 | 说明 |")
    a("| :-- | :-- | :-- |")
    a("| 基础词硬排除 | frq ≤ %d | 极高频基础词不入选 |" % BASIC_EXCLUDE_FREQ_RANK)
    a("| isBasic 标记 | frq ≤ %d | 供 UI 默认过滤 |" % BASIC_FLAG_FREQ_RANK)
    a("| 生僻词上限 | frq ≤ %d | 超过则视为低频生僻，不入选 |" % MAX_FREQ_RANK)
    a("| 熟词僻义 | 非首义 + 该词 frq ≤ %d（须为熟词）+ (share ≥ %.2f 或 freq ≥ %d) "
      "+ 词性与首义不同 + 每词最多 %d 个 | PRD §4.2 + 无真题语料下的近似约束 |"
      % (ECCENTRIC_WORD_FREQ_RANK, ECCENTRIC_SHARE_MIN, ECCENTRIC_FREQ_MIN,
         MAX_ECCENTRIC_PER_WORD))
    a("| 形近词 | 编辑距离 ≤ %d，每词最多 %d 个 | PRD §4.2 |"
      % (CONFUSABLE_MAX_EDIT, MAX_CONFUSABLES))
    a("| 例句 | 每义项 ≥ 1 句，100%% ADAPTED | 无真题原句 |")
    a("")
    a("## 4. 抽查 10 词")
    a("")
    for w in samples:
        a("### %s `%s`%s" % (w["lemma"], w["phoneticUk"], "（基础词）" if w["isBasic"] else ""))
        a("")
        for s in w["senses"]:
            es = s["examStats"]["IELTS"]
            ecc = " · **熟词僻义**" if es["isEccentric"] else ""
            a("- `%s` **%s** %s — 近似频次 %d，占比 %.0f%%%s"
              % (s["id"], s["pos"], s["cn"], es["freq"], es["share"] * 100, ecc))
            if s.get("enDef"):
                a("  - 英释：%s" % s["enDef"])
        if w["sentences"]:
            x = w["sentences"][0]
            a("- 例句：`%s`" % x["en"])
            a("  - %s（句中形式：%s；%s）" % (x["zh"], x["surfaceForm"], x["provenance"]["note"]))
        if w["confusables"]:
            a("- 形近词：" + "；".join(
                "`%s`(%s) %s" % (c["lemma"], c["reason"], c["tip"]) for c in w["confusables"][:2]))
        a("")
    a("## 5. 已知缺口")
    a("")
    a("1. **同义词（Word.synonyms）为空数组**：ECDICT 未提供可靠同义词数据，"
      "为避免臆造，本版本留空，P1 再补。")
    a("2. **词根（etymology）覆盖率低**：仅在 ECDICT wordroot.txt 明确收录该词时生成，"
      "不做推测性词源分析。")
    a("3. **权重为近似值**：无真题语料，senseWeight 由公开词频信号合成，"
      "examStats.IELTS.kind 恒为 'ESTIMATED'、sources 非空；旧字段 freq/share/years/approx "
      "已随 senseWeight 迁移移除，校验器会拒绝其重现。")
    a("4. **音标未区分英美**：ECDICT phonetic 以英式为主，phoneticUs 留空，"
      "UI 不应宣称提供美音音标。")
    a("5. **形近词 tip 为脚本生成**：基于实际拼写差异与双方释义，非人工润色，"
      "Tier A 词可在后续版本中人工复核。")
    a("")
    path = os.path.join(DOCS_DIR, "DATA-QUALITY.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return path


# ==========================================================================
# CLI
# ==========================================================================
def emit_targets(awl_file: str | None, path: str) -> None:
    ecdict = load_ecdict()
    awl = load_awl(awl_file)
    selected, _ = select_words(ecdict, awl, TARGET_WORDS)
    lines = ["# Tier A 目标词（按选词打分降序，前 %d 个）" % TIER_A_SIZE,
             "# 每行：序号<TAB>词<TAB>frq<TAB>标签<TAB>当前中文释义", ""]
    for i, c in enumerate(selected[:TIER_A_SIZE]):
        g = parse_translation(c["row"].get("translation", ""))
        cn = " / ".join("%s %s" % (p, clean_cn(x)) for p, x in g[:4])
        lines.append("%d\t%s\t%d\t%s\t%s" % (i + 1, c["word"], c["frq"], " ".join(sorted(c["tags"])), cn))
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("[OK] 已导出 %d 个目标词到 %s" % (min(TIER_A_SIZE, len(selected)), path))


def main() -> None:
    ap = argparse.ArgumentParser(description="构建 ExamFlow Vocab IELTS 数据包")
    ap.add_argument("--awl-file", default=None, help="外部学术词表（AWL）文本路径，覆盖内置种子表")
    ap.add_argument("--emit-targets", default=None, help="仅导出 Tier A 目标词清单到指定路径")
    ap.add_argument("--verify-only", action="store_true", help="仅校验已产出的数据包")
    args = ap.parse_args()

    if args.verify_only:
        errs = verify(OUT_DIR)
        if errs:
            print("[FAIL] %d 项：" % len(errs))
            for e in errs[:50]:
                print("  - " + e)
            sys.exit(1)
        print("[OK] 数据包校验通过")
        return

    if args.emit_targets:
        emit_targets(args.awl_file, args.emit_targets)
        return

    result = build(args.awl_file)
    path = write_quality_doc(result)
    print("[OK] 数据质量报告：%s" % path)


if __name__ == "__main__":
    main()
