#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把已生成的 IELTS 数据包从旧 examStats（freq/share/years）迁移到
PRD v0.3 契约：{ senseWeight, tier, kind:'ESTIMATED', sources, isEccentric }。

背景：scripts/etl_build_pack.py 首轮跑在 PRD v0.2 契约上（freq/share/years），
PRD v0.3 定稿后删除了 years（无真题语料，禁止编造年份），freq 改为公开信号
合成的 senseWeight 估计值。本脚本保留 chunk 里已生成的高质量内容
（音标、义项中英释义、例句、词根、形近词、近义词、lemma-map），只重算
examStats.IELTS，并重算 sha256、更新 manifest。

senseWeight = round(100 * (0.25*W_awl + 0.45*W_gen + 0.10*W_ox + 0.20*W_wn))
  W_awl : 命中内置学术种子词表（近似 Coxhead AWL 取向）= 1.0，否则 0
  W_gen : ECDICT 词频序号 frq/bnc 的对数归一中段值，线性抬升到 0.30~1.0
          （0.30 + 0.70 * (1 - ln(rank)/ln(MAX_FREQ_RANK))，排除极高频基础词与极低频生僻词）
  W_ox  : 柯林斯 >= 3 星且非牛津 3000 核心词（Oxford5000 B2-C1 的近似）= 1.0，否则 0
  W_wn  : 义项在 ECDICT 释义序列中的位置权重（首义 1.0，其后递减，近似 WordNet 义项占比）

权重校准记录（PRD v0.3 公式为 0.45/0.30/0.15/0.10，标注为【假设】）：
  首版实现发现分布双峰断层 —— 学术词表命中率仅约 22%，0.45 的二元权重使
  命中词（60+）与无信号词（20-29）之间出现 30-59 的真空带，tier 分位切分后
  「核心」层混入大量无信号词，语义不诚实。校准为 0.25/0.45/0.10/0.20 并
  调整 W_gen 映射区间后分布连续：无信号主体 34-45、学术词 55-70、顶端约 79。
  本记录同步写入 docs/DATA-QUALITY.md 与 SPEC 变更记录。

用法：python migrate_sense_weight.py [--dry-run]
依赖：scripts/.cache/ecdict.csv（由 etl_build_pack.py 的 fetch 流程下载）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import etl_build_pack as etl  # noqa: E402  -- 复用常量与数据加载，不重写

PACK_DIR = Path(__file__).resolve().parent.parent / "public" / "packs" / "IELTS"
NEW_PACK_VERSION = "1.1.0"

SENSE_POS_WEIGHTS = [1.0, 0.55, 0.35, 0.25]
EXTRA_SENSE_WEIGHT = 0.2

FREQ_METHOD_NOTE = (
    "义项权重为公开信号合成的估计值，不是雅思真题出现次数。"
    "senseWeight = 100 x (0.25*学术词表 + 0.45*通用词频 + 0.10*牛津5000向 + 0.20*义项位置权重)，"
    "各信号含义见 sense.sources。tier 按全库 senseWeight 分位切分：核心约30% / 进阶约40% / 拓展约30%。"
)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for blk in iter(lambda: f.read(1 << 20), b""):
            h.update(blk)
    return h.hexdigest()


def general_freq_component(row: dict) -> tuple[float, list[str]]:
    """W_gen：词频序号的对数归一中段值，线性抬升到 0.30~1.0。"""
    frq = etl.to_int(row.get("frq"), 0)
    bnc = etl.to_int(row.get("bnc"), 0)
    rank = frq if frq > 0 else bnc
    if rank <= 0:
        return 0.30, []
    v = max(0.0, 1.0 - math.log(rank) / math.log(etl.MAX_FREQ_RANK))
    src = "ECDICT-frq" if frq > 0 else "ECDICT-bnc"
    return 0.30 + 0.70 * v, [src]


def pos_head(pos: str) -> str:
    p = (pos or "").strip().lower()
    for sep in (".", "/", " "):
        if sep in p:
            p = p.split(sep)[0]
    return p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只重算并打印统计，不写盘")
    args = ap.parse_args()

    manifest_path = PACK_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    chunks = sorted(PACK_DIR.glob("chunk-*.json"), key=lambda p: int(p.stem.split("-")[1]))

    print("[INFO] 载入 ECDICT 与学术词表 ...")
    ecdict = etl.load_ecdict()
    awl = etl.load_awl(None)
    print("[INFO] ECDICT %d 词 / 学术词表 %d 词 / 数据包 %d 块" % (len(ecdict), len(awl), len(chunks)))

    all_words: list[dict] = []
    for cp in chunks:
        data = json.loads(cp.read_text(encoding="utf-8"))
        for w in data["words"]:
            all_words.append(w)

    # ---- 第一遍：计算 senseWeight 与 sources ----
    missing_row = 0
    for w in all_words:
        row = ecdict.get(w["lemma"])
        if row is None:
            missing_row += 1
        w_gen, gen_src = general_freq_component(row) if row else (0.0, [])
        w_awl = 1.0 if w["lemma"] in awl else 0.0
        collins = etl.to_int((row or {}).get("collins"), 0)
        oxford = (row or {}).get("oxford", "")
        w_ox = 1.0 if (collins >= 3 and oxford != "1") else 0.0

        senses = w["senses"]
        weights: list[int] = []
        sources_all: list[list[str]] = []
        for i, _s in enumerate(senses):
            w_wn = SENSE_POS_WEIGHTS[i] if i < len(SENSE_POS_WEIGHTS) else EXTRA_SENSE_WEIGHT
            sw = round(100 * (0.25 * w_awl + 0.45 * w_gen + 0.10 * w_ox + 0.20 * w_wn))
            weights.append(sw)
            src = list(gen_src)
            if w_awl:
                src.append("AcademicSeedList")
            if w_ox:
                src.append("Collins-star>=3")
            src.append("ECDICT-sense-order")
            sources_all.append(src)

        total = sum(weights) or 1
        shares = [x / total for x in weights]

        frq_rank = etl.to_int((row or {}).get("frq"), 0)
        is_common_word = 0 < frq_rank <= etl.ECCENTRIC_WORD_FREQ_RANK
        first_pos = pos_head(senses[0].get("pos", "")) if senses else ""
        best_ecc: tuple[float, int] | None = None
        for i in range(1, len(senses)):
            if not is_common_word:
                continue
            if not (weights[i] >= 60 or shares[i] >= etl.ECCENTRIC_SHARE_MIN):
                continue
            if first_pos and pos_head(senses[i].get("pos", "")) == first_pos:
                continue
            cand = (weights[i], -i)
            if best_ecc is None or cand > best_ecc:
                best_ecc = cand

        for i, s in enumerate(senses):
            s["examStats"] = {
                "IELTS": {
                    "senseWeight": weights[i],
                    "tier": "PENDING",  # 第二遍按全局分位回填
                    "kind": "ESTIMATED",
                    "sources": sources_all[i],
                    "isEccentric": best_ecc is not None and best_ecc[1] == -i,
                }
            }

    # ---- 第二遍：tier 按全局 senseWeight 分位切分（核心 30 / 进阶 40 / 拓展 30）----
    pool = sorted(
        (s["examStats"]["IELTS"]["senseWeight"] for w in all_words for s in w["senses"]),
        reverse=True,
    )
    n = len(pool)
    core_cut = pool[max(0, math.ceil(n * 0.30) - 1)] if n else 0
    adv_cut = pool[max(0, math.ceil(n * 0.70) - 1)] if n else 0
    tier_count = {"CORE": 0, "ADVANCED": 0, "EXTENDED": 0}
    for w in all_words:
        for s in w["senses"]:
            sw = s["examStats"]["IELTS"]["senseWeight"]
            tier = "CORE" if sw >= core_cut else ("ADVANCED" if sw >= adv_cut else "EXTENDED")
            s["examStats"]["IELTS"]["tier"] = tier
            tier_count[tier] += 1

    # ---- 统计 ----
    sense_total = sum(len(w["senses"]) for w in all_words)
    ecc_count = sum(
        1 for w in all_words for s in w["senses"] if s["examStats"]["IELTS"]["isEccentric"]
    )
    sent_count = sum(len(w.get("sentences", [])) for w in all_words)
    sources_missing = sum(
        1
        for w in all_words
        for s in w["senses"]
        if not s["examStats"]["IELTS"]["sources"]
    )
    stats = {
        "words": len(all_words),
        "senses": sense_total,
        "senseCardsEstimate": sense_total,
        "tierDistribution": tier_count,
        "eccentricSenses": ecc_count,
        "sentences": sent_count,
        "sourcesCoverage": f"{(sense_total - sources_missing) / max(1, sense_total):.1%}",
        "missingEcdictRow": missing_row,
        "coreCut": core_cut,
        "advancedCut": adv_cut,
    }
    print("[STATS] " + json.dumps(stats, ensure_ascii=False))

    # ---- 合规自检：不得残留 years / freq / share / approx / REAL_EXAM ----
    violations: list[str] = []
    for w in all_words:
        for s in w["senses"]:
            st = s["examStats"]["IELTS"]
            for banned in ("years", "freq", "share", "approx"):
                if banned in st:
                    violations.append(f"{w['lemma']}/{s['id']} 残留字段 {banned}")
            if st.get("kind") != "ESTIMATED":
                violations.append(f"{w['lemma']}/{s['id']} kind 非 ESTIMATED")
        for sent in w.get("sentences", []):
            prov = sent.get("provenance", {})
            if prov.get("type") != "ADAPTED":
                violations.append(f"{w['lemma']} 例句 {sent.get('id')} provenance 非 ADAPTED")
            note = (prov.get("note") or "")
            for banned_kw in ("剑桥", "雅思真题", "Test ", "Passage"):
                if banned_kw in note:
                    violations.append(f"{w['lemma']} 例句 {sent.get('id')} note 含真题暗示「{banned_kw}」")
    if violations:
        print("[FATAL] 合规自检失败 %d 条：" % len(violations))
        for v in violations[:20]:
            print("   - " + v)
        return 1
    print("[OK] 合规自检通过：无 years/freq/share/approx 残留，例句全部 ADAPTED 且无真题暗示")

    if args.dry_run:
        print("[DRY-RUN] 未写盘")
        return 0

    # ---- 写回 chunk 并重算 sha256 ----
    now_iso = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
    idx = 0
    for cp in chunks:
        data = json.loads(cp.read_text(encoding="utf-8"))
        size = len(data["words"])
        data["version"] = NEW_PACK_VERSION
        data["words"] = all_words[idx : idx + size]
        idx += size
        cp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    new_chunks = []
    for entry in manifest["chunks"]:
        fp = PACK_DIR / entry["file"]
        new_chunks.append(
            {
                **entry,
                "sha256": sha256_file(fp),
                "bytes": fp.stat().st_size,
            }
        )
    lm = PACK_DIR / "lemma-map.json"
    manifest.update(
        {
            "version": NEW_PACK_VERSION,
            "generatedAt": now_iso,
            "chunks": new_chunks,
            "lemmaMap": {**manifest.get("lemmaMap", {}), "sha256": sha256_file(lm)},
            "frequencyMethod": FREQ_METHOD_NOTE,
        }
    )
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("[OK] 已写回 %d 个 chunk 与 manifest（version=%s）" % (len(chunks), NEW_PACK_VERSION))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
