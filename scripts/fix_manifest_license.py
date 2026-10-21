#!/usr/bin/env python3
"""修正 manifest.json 的 license 字段：迁移到 senseWeight 契约后，
license 文本仍描述旧的 freq/approx/years 方法，属于合规性描述失真。
只改 license 字符串，其余字段原样写回（indent=2 与迁移脚本一致）。
"""
import json
import sys
from pathlib import Path

MANIFEST = Path(__file__).resolve().parent.parent / "public" / "packs" / "IELTS" / "manifest.json"

NEW_LICENSE = """ExamFlow Vocab · IELTS 数据包 v1.1.0
== 词典数据 ==
来源：ECDICT (https://github.com/skywind3000/ECDICT)，MIT License，版权归 skywind3000 及贡献者所有。ECDICT 自身汇集 MIT / WordNet (WordNet License) / cdict 等允许商用的开放来源。本数据包仅使用其词条、音标、中英文释义、词频与词形变化字段。
词形还原补充：ECDICT lemma.en.txt（BNC 语料派生，作者声明可用于研究与教育用途）。
词根说明：ECDICT wordroot.txt。
== 例句 ==
本数据包内所有例句均为仿真例句（provenance.type = ADAPTED），由脚本模板生成或人工撰写，用于演示义项用法。不含、也不声称来自剑桥雅思真题、剑桥大学出版社、British Council、IDP 或任何其他受版权保护的考试材料。例句中的年份、机构、数据均为虚构，仅用于构造语境。
== 义项权重（合规声明） ==
本项目没有雅思真题语料，因此不允许、也不存在「在雅思中出现 N 次」这类考频表述。
examStats.IELTS.senseWeight 是由公开信号合成的估计值（0~100），kind 恒为 'ESTIMATED'，
每个义项的 sources 字段列出其权重来源信号。计算公式：
    senseWeight = 100 x (0.25*W_awl + 0.45*W_gen + 0.10*W_ox + 0.20*W_wn)
其中 W_awl 为学术词表（近似 Coxhead AWL 取向）命中权重，W_gen 由 ECDICT 当代语料库
词频序号 frq 映射到 0.30~1.00，W_ox 为牛津 5000 考试向权重，W_wn 为 WordNet 义项
顺序权重 [0.46, 0.26, 0.16, 0.12] 归一。权重仅用于学习优先级排序，不是真题统计值。
tier（核心/进阶/拓展）按全库 senseWeight 分位切分，约 30% / 40% / 30%。
== 不使用的数据 ==
不使用柯林斯释义（需商业授权）、有道 dictvoice 等非公开接口、kajweb/dict 等来源不明数据集。
== 商标 ==
IELTS 是剑桥大学出版社、British Council 与 IDP 的注册商标；本数据包为独立编制的学习材料，未获其授权或背书。"""


def main() -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    old = manifest.get("license", "")
    if "approx" in old or "freq = clamp" in old:
        print("[FIX] license 文本仍为旧公式，执行替换")
    else:
        print("[SKIP] license 文本已是新契约")
        return 0
    manifest["license"] = NEW_LICENSE
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("[OK] license 字段已更新，版本仍为", manifest.get("version"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
