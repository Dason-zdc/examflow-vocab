# -*- coding: utf-8 -*-
"""
enrich_pack_sentences.py — 用语料例句替换模板例句（构建期脚本，不进入运行时）

背景：原 ETL 对 Tier B 词用 3 个句式模板套词生成例句（"The concept of X is central to..."），
换个词就是同一句，学习者学不到真实搭配。这里改用 Tatoeba 英中句对
（真实人类撰写 + 人工翻译，CC BY 2.0 FR），并按义项对齐。

数据来源两级：
  1. 本地导出（快、全量）：cmn-eng 直连句对 + 中英句子表；
  2. Tatoeba API（补漏）：导出只含「直连」翻译，部分句对是间接翻译，
     对未命中的词逐词查询 API 补齐（带磁盘缓存，可重复执行）。

质量闸门：词形精确匹配 / 长度 / 专有名词黑名单 / 内容黑名单 / 繁简统一（OpenCC）/
译文长度比例 / 数字与引号；义项对齐用「词性（由 ECDICT exchange 推断）+ 中文关键词命中」。

用法：
  python scripts/fetch_tatoeba.py                     # 先下载语料
  python scripts/enrich_pack_sentences.py --dry       # 只统计覆盖率与抽样
  python scripts/enrich_pack_sentences.py             # 写数据包 + manifest + picks
  python scripts/enrich_pack_sentences.py --no-api    # 不调用 API 补漏
"""
import argparse
import bz2
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK_DIR = os.path.join(ROOT, "public", "packs", "IELTS")
CACHE = os.path.join(ROOT, "scripts", ".cache", "tatoeba")
API_CACHE = os.path.join(CACHE, "api")
PICKS_PATH = os.path.join(ROOT, "scripts", "build", "sentence-picks.json")

NEXT_VERSION = "1.3.0"
CORPUS_NOTE = "语料例句（Tatoeba 英中句对，CC BY 2.0 FR）"
MAX_SENTENCES_PER_WORD = 3
MIN_WORDS, MAX_WORDS = 5, 20

# Tatoeba 里大量 "Tom is ..." 教学句，对雅思备考没有参考价值
NAME_BLACKLIST = {
    "tom", "mary", "john", "jim", "bob", "bill", "jane", "jack", "mike", "sue",
    "kate", "ken", "kenji", "takashi", "yumi", "hanako", "taro", "ichiro",
    "nancy", "peter", "paul", "linda", "susan", "david", "robert", "james",
    "betty", "alice", "frank", "george", "helen", "sally", "boston", "tokyo",
    "skura", "yanni",
}

# 语料（尤其字幕类）低质内容的兜底过滤
CONTENT_BLOCKLIST = {
    "sex", "sexual", "sexy", "porn", "rape", "condom", "kiss", "kissing",
    "damn", "hell", "shit", "fuck", "fucking", "bitch", "bastard", "stupid",
    "kill", "killed", "murder", "suicide", "drunk", "beer", "wine", "cigarette",
}

# 常见繁体专用字：缺 OpenCC 时的降级过滤
TRAD_ONLY = set(
    "們這說個對時學國會為與產業發現樣開關麼東車馬鳥魚龍買賣讀寫聽話語詞銀錢鐵長門問間際"
    "陽陰隊階級經濟統認識記憶練習題庫證據轉變邊遠進裡兒幾頭體見覺觀點線網張閉讓該還過運"
    "動員醫藥農機應當種類數據標準環境響聲總體藝術樂隊戰爭擊敗勝負責任義務權利權力"
    "無線電視電話電腦網絡軟體硬體資訊報導廣告雜誌圖書館醫院餐廳賓館飯店機場車站廁所垃圾"
    "廚房臥室窗戶牆壁樓層電梯樓梯鑰匙錢包護照簽證機票預訂旅遊導遊風景點門票紀念品禮物"
    "禮拜選擇決定認為覺得希望願意擔心害怕生氣高興難過興趣愛好習慣經驗能力機會"
    "關係聯繫溝通討論議題建議意見問題答案方法方式辦法結果原因影響變化發展進步提高"
    "減少增加保護破壞利用浪費節約環保污染健康營養運動鍛煉睡眠壓力緊張放鬆心情"
)

WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’-]*")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")
LATIN_IN_ZH_RE = re.compile(r"[A-Za-z]{2,}")

try:
    from opencc import OpenCC

    _CC = OpenCC("t2s")
except Exception:  # pragma: no cover
    _CC = None


# ==========================================================================
# 基础工具
# ==========================================================================
def read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def needs_corpus(word):
    """需要语料例句的词：既不是人工例句（Tier A），也还没有语料例句。

    用「来源标记」而不是「note 里有没有模板生成」判断，保证脚本可重复执行：
    第一次跑完后二次执行仍会复查「没有例句」的词，不会误伤已替换的语料句。
    """
    sentences = word.get("sentences", [])
    for s in sentences:
        p = s.get("provenance", {})
        if p.get("origin") == "TATOEBA":
            return False
        if "人工撰写" in (p.get("note") or ""):
            return False
    return True


def load_pack():
    chunks = []
    for name in sorted(os.listdir(PACK_DIR)):
        if name.startswith("chunk-") and name.endswith(".json"):
            chunks.append((name, read_json(os.path.join(PACK_DIR, name))))
    return chunks


def forms_of(lemma, exchange):
    """原形 + ECDICT exchange 变形 → {form: kind}，kind ∈ base/verb/noun/adj"""
    forms = {lemma.lower(): "base"}
    for item in (exchange or "").split("/"):
        if ":" not in item:
            continue
        t, v = item.split(":", 1)
        v = v.strip().lower()
        if not v or " " in v or "-" in v:
            continue
        if t in ("p", "d", "i", "3"):
            forms.setdefault(v, "verb")
        elif t == "s":
            forms.setdefault(v, "noun")
        elif t in ("r", "t"):
            forms.setdefault(v, "adj")
    return forms


def normalize_zh(text):
    if _CC is None:
        return None if any(ch in TRAD_ONLY for ch in text) else text
    return _CC.convert(text)


def zh_ok(zh):
    if len(zh) < 4:
        return False
    if not CJK_RE.search(zh):
        return False
    if LATIN_IN_ZH_RE.search(zh):  # 「X 是……」这类夹英文的翻译腔
        return False
    if "「" in zh or "」" in zh:
        return False
    return True


def en_ok(en, tokens):
    if not (MIN_WORDS <= len(tokens) <= MAX_WORDS):
        return False
    if any(ch.isdigit() for ch in en):
        return False
    if '"' in en or ":" in en or "..." in en or "/" in en or "—" in en:
        return False
    if not en[0].isupper():
        return False
    if not en.rstrip().endswith((".", "?", "!")):
        return False
    return True


def ratio_ok(en, zh):
    """译文长度比例（汉字数 / 英文词数）：过滤错配翻译"""
    words = len(WORD_RE.findall(en))
    chars = len(CJK_RE.findall(zh))
    if words == 0:
        return False
    r = chars / words
    return 0.7 <= r <= 3.2


def keyword_set(cn):
    body = re.sub(r"[（(][^）)]*[）)]", "", cn or "")
    out = set()
    for part in re.split(r"[、，,；;/]", body):
        p = re.sub(r"^(使|被|把|对|向|给|在|用|以)", "", part.strip())
        p = re.sub(r"(的|地|了|着|过)$", "", p)
        if len(p) >= 2:
            out.add(p)
    return out


# ==========================================================================
# 候选句：导出侧
# ==========================================================================
def build_corpus(needed_forms):
    links_path = os.path.join(CACHE, "cmn-eng_links.tsv.bz2")
    cmn_path = os.path.join(CACHE, "cmn_sentences_detailed.tsv.bz2")
    eng_path = os.path.join(CACHE, "eng_sentences.tsv.bz2")
    for p in (links_path, cmn_path, eng_path):
        if not os.path.exists(p):
            sys.exit("缺少语料文件：%s（先跑 python scripts/fetch_tatoeba.py）" % p)

    cmn_text = {}
    with bz2.open(cmn_path, "rt", encoding="utf-8") as f:
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 3:
                continue
            zh = normalize_zh(cols[2])
            if zh and zh_ok(zh):
                cmn_text[cols[0]] = zh

    eng_to_cmn = defaultdict(list)
    with bz2.open(links_path, "rt", encoding="utf-8") as f:
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 2:
                continue
            if cols[0] in cmn_text:
                eng_to_cmn[cols[1]].append(cols[0])

    out = []
    with bz2.open(eng_path, "rt", encoding="utf-8") as f:
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 3:
                continue
            eid, en = cols[0], cols[2]
            cids = eng_to_cmn.get(eid)
            if not cids:
                continue
            tokens = WORD_RE.findall(en)
            if not en_ok(en, tokens):
                continue
            lowered = [t.lower() for t in tokens]
            if any(t in NAME_BLACKLIST or t in CONTENT_BLOCKLIST for t in lowered):
                continue
            hit = None
            for idx, tok in enumerate(lowered):
                kind = needed_forms.get(tok)
                if not kind:
                    continue
                if tokens[idx][0].isupper() and idx > 0:
                    continue  # Bond Street / James Bond 这类专有名词
                hit = (tok, kind)
                break
            if not hit:
                continue
            surface, kind = hit
            for cid in cids[:2]:
                zh = cmn_text[cid]
                if not ratio_ok(en, zh):
                    continue
                out.append((en, zh, surface, cid, kind))
    return out


# ==========================================================================
# 候选句：Tatoeba API 补漏
# ==========================================================================
def api_candidates(lemma, forms, use_cache=True):
    os.makedirs(API_CACHE, exist_ok=True)
    cache_path = os.path.join(API_CACHE, "%s.json" % re.sub(r"[^a-z0-9_-]", "_", lemma.lower()))
    data = None
    if use_cache and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    if data is None:
        params = {"from": "eng", "to": "cmn", "query": lemma, "orphans": "no", "unapproved": "no"}
        url = "https://tatoeba.org/en/api_v0/search?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": "examflow-vocab-build/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read())
        except Exception:
            data = {"results": []}
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        time.sleep(0.35)

    out = []
    for res in data.get("results", []):
        en = (res.get("text") or "").strip()
        tokens = WORD_RE.findall(en)
        if not en_ok(en, tokens):
            continue
        lowered = [t.lower() for t in tokens]
        if any(t in NAME_BLACKLIST or t in CONTENT_BLOCKLIST for t in lowered):
            continue
        surface = kind = None
        for idx, tok in enumerate(lowered):
            if tok in forms:
                if tokens[idx][0].isupper() and idx > 0:
                    continue
                surface, kind = tok, forms[tok]
                break
        if not surface:
            continue  # 只做词形精确匹配：conservation 不接受 conservative
        for group in res.get("translations", []):
            for t in group:
                if t.get("lang") != "cmn":
                    continue
                zh = normalize_zh(t.get("text") or "")
                if not zh or not zh_ok(zh) or not ratio_ok(en, zh):
                    continue
                out.append((en, zh, surface, str(res.get("id")), kind))
                break
            else:
                continue
            break
    return out


# ==========================================================================
# 义项对齐
# ==========================================================================
def score_candidate(en, zh, kind, sense, tokens):
    pos = sense.get("pos", "")
    score = 0.0
    if pos.startswith("v") and kind == "verb":
        score += 4
    elif pos.startswith("n") and kind in ("base", "noun"):
        score += 4
    elif pos.startswith("adj") and kind in ("base", "adj"):
        score += 4
    elif kind == "base":
        score += 1
    else:
        score -= 3

    hits = sum(1 for kw in keyword_set(sense.get("cn", "")) if kw in zh)
    score += min(hits, 3) * 2

    n = len(tokens)
    if 7 <= n <= 14:
        score += 2
    elif n <= 6 or n >= 18:
        score -= 1
    if en.endswith("?"):
        score -= 0.5
    if en.endswith("!"):
        score -= 1
    if en.startswith("I "):
        score -= 0.5
    return score


def pick_from_candidates(word, candidates):
    senses = word.get("senses", [])
    if not senses or not candidates:
        return []
    scored = []
    seen = set()
    for en, zh, surface, cid, kind in candidates:
        key = en.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        tokens = WORD_RE.findall(en)
        for si, sense in enumerate(senses):
            s = score_candidate(en, zh, kind, sense, tokens)
            if s > 0:
                scored.append((s, si, en, zh, surface, cid))
    scored.sort(key=lambda x: (-x[0], len(x[2])))

    picks, used_senses, used_text = [], set(), set()
    for s, si, en, zh, surface, cid in scored:
        if len(picks) >= MAX_SENTENCES_PER_WORD:
            break
        if si in used_senses or en.strip().lower() in used_text:
            continue
        used_senses.add(si)
        used_text.add(en.strip().lower())
        picks.append(
            {"senseId": senses[si]["id"], "en": en, "zh": zh, "surface": surface, "sourceId": cid, "score": round(s, 2)}
        )
    return picks


# ==========================================================================
# 主流程
# ==========================================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--sample", type=int, default=10)
    ap.add_argument("--no-api", action="store_true")
    ap.add_argument("--api-budget", type=int, default=600, help="API 补漏最多查询多少词")
    args = ap.parse_args()

    chunks = load_pack()
    all_words = [w for _, c in chunks for w in c["words"]]
    target = [w for w in all_words if needs_corpus(w)]

    needed_forms = {}
    for w in target:
        for form, kind in forms_of(w["lemma"], w.get("exchange", "")).items():
            needed_forms.setdefault(form, kind)

    print("待替换词：%d / %d（其余为 Tier A 人工例句）" % (len(target), len(all_words)))
    corpus = build_corpus(needed_forms)
    print("导出口语料候选句对：%d" % len(corpus))
    by_form = defaultdict(list)
    for row in corpus:
        by_form[row[2]].append(row)

    picks = {}
    for w in target:
        forms = forms_of(w["lemma"], w.get("exchange", ""))
        cands = []
        for form in forms:
            cands.extend(by_form.get(form, [])[:60])
        picks[w["id"]] = pick_from_candidates(w, cands)
    hit = sum(1 for v in picks.values() if v)
    print("导出命中：%d 词（%.1f%%）" % (hit, hit / max(1, len(target)) * 100))

    missing = [w for w in target if not picks.get(w["id"])]
    if missing and not args.no_api:
        budget = min(len(missing), args.api_budget)
        print("API 补漏：%d 词（预算 %d）..." % (len(missing), budget))
        base = sum(1 for v in picks.values() if v)
        for i, w in enumerate(missing[:budget], 1):
            forms = forms_of(w["lemma"], w.get("exchange", ""))
            p = pick_from_candidates(w, api_candidates(w["lemma"], forms))
            if p:
                picks[w["id"]] = p
            if i % 50 == 0:
                print("  %d/%d 已补 %d" % (i, budget, sum(1 for v in picks.values() if v) - base))
        hit = sum(1 for v in picks.values() if v)
        print("API 后合计：%d 词（%.1f%%）" % (hit, hit / max(1, len(target)) * 100))

    covered_senses = sum(len(v) for v in picks.values())
    total_senses = sum(len(w.get("senses", [])) for w in target)
    print("义项覆盖：%d / %d（%.1f%%）" % (covered_senses, total_senses, covered_senses / max(1, total_senses) * 100))

    by_id = {w["id"]: w for w in target}
    sample_ids = ["w_bond"] + [wid for wid, v in picks.items() if v and wid != "w_bond"]
    print("\n===== 抽样 =====")
    for wid in sample_ids[: args.sample]:
        w = by_id.get(wid)
        if not w:
            continue
        print("\n%s  %s" % (w["lemma"], [s["cn"] for s in w["senses"]]))
        for item in picks[wid]:
            print("   %s\n     %s  (#%s)" % (item["en"], item["zh"], item["sourceId"]))

    if args.dry:
        return

    manifest = read_json(os.path.join(PACK_DIR, "manifest.json"))
    manifest["version"] = NEXT_VERSION
    manifest["sentencePolicy"] = (
        "语料例句优先：只收录可溯源的 Tatoeba 英中句对；暂无语料的义项标记 sentencePending，不再用模板句填充"
    )
    replaced = 0
    pending = 0
    for name, chunk in chunks:
        chunk["version"] = NEXT_VERSION
        for w in chunk["words"]:
            if w["id"] not in picks:
                continue  # Tier A 人工例句，保持不动
            p = picks[w["id"]]
            existing = {s["id"]: s for s in w.get("sentences", [])}
            fresh = []
            for item in p:
                old = existing.get(item["senseId"])
                sid = old["id"] if old else "x_%s_%s" % (
                    w["id"].replace("w_", ""),
                    item["senseId"].split("_", 1)[-1],
                )
                fresh.append(
                    {
                        "id": sid,
                        "wordId": w["id"],
                        "senseId": item["senseId"],
                        "en": item["en"],
                        "zh": item["zh"],
                        "surfaceForm": item["surface"],
                        "provenance": {
                            "type": "ADAPTED",
                            "note": CORPUS_NOTE,
                            "origin": "TATOEBA",
                            "sourceId": item["sourceId"],
                        },
                    }
                )
            replaced += max(0, len(w.get("sentences", [])) - len(fresh))
            w["sentences"] = fresh
            covered = {x["senseId"] for x in fresh}
            for s in w.get("senses", []):
                if s["id"] in covered:
                    s.pop("sentencePending", None)
                else:
                    s["sentencePending"] = True
                    pending += 1
        path = os.path.join(PACK_DIR, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(chunk, f, ensure_ascii=False, separators=(",", ":"))
            f.write("\n")
        digest = sha256_file(path)
        for entry in manifest["chunks"]:
            if entry["file"] == name:
                entry["sha256"] = digest
                entry["bytes"] = os.path.getsize(path)

    with open(os.path.join(PACK_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
        f.write("\n")

    # picks 以「最终数据包」为准重建：增量运行时不会丢掉上一次已经写好的词条，
    # 同时把「查过但没有可用例句」的词显式记为 []，供 etl_build_pack.py 全量重建时复用。
    final_picks = {}
    for _name, chunk in chunks:
        for w in chunk["words"]:
            corpus_sents = [x for x in w.get("sentences", []) if x.get("provenance", {}).get("origin") == "TATOEBA"]
            if corpus_sents:
                final_picks[w["id"]] = [
                    {
                        "senseId": x["senseId"],
                        "en": x["en"],
                        "zh": x["zh"],
                        "surface": x["surfaceForm"],
                        "sourceId": x["provenance"].get("sourceId", ""),
                    }
                    for x in corpus_sents
                ]
            elif not w.get("sentences"):
                final_picks[w["id"]] = []
    write_json(PICKS_PATH, {"version": NEXT_VERSION, "note": CORPUS_NOTE, "words": final_picks})
    print("\n替换掉模板句 %d 条；义项标记 sentencePending %d 个" % (replaced, pending))
    print("picks → %s" % PICKS_PATH)


if __name__ == "__main__":
    main()
