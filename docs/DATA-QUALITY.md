# IELTS 数据包 · 数据质量自检报告

> 由 `scripts/etl_build_pack.py` 自动生成，重新构建时会覆盖。
>
> **v1.3.0 变更（2026-10-21）**：例句不再由句式模板套词生成。Tier B 的 1700 个词改用 Tatoeba 英中句对（真实人工撰写 + 人工翻译，CC BY 2.0 FR），
> 覆盖 1445 词 / 2942 义项；剩下 255 词在语料中确实没有可用句对，义项标 `sentencePending`，界面明示「暂无可溯源的语料例句」。
> 因此下方「覆盖率（义项维度）」从 100% 降到 70.9%，这是**去水**后的真实值——旧报告的 100% 是靠模板句刷出来的。
> 第 5 节的逐词样本仍是 v1.2.0 的模板句，仅作历史对照；新口径见 README「例句来源与署名」。
> 生成时间：2026-10-21T00:46:20+08:00
> 交付校验：`python scripts/etl_build_pack.py --verify-only` 通过（sha256 / bytes / 词条与义项 ID 唯一性 / 例句覆盖 / 形近词约束 / examStats 新Schema）

## 1. 总量

| 指标 | 数值 |
| :-- | --: |
| 词数 | 2000 |
| 义项总数 | 4150 |
| 每词平均义项数 | 2.08 |
| 例句总数 | 2942（语料例句 2616 + 人工撰写 326） |
| 例句覆盖率（义项维度） | 70.9%（2942 / 4150） |
| 例句覆盖率（词条维度） | 87.3%（1745 / 2000） |
| 无例句义项（sentencePending） | 1208 |
| 熟词僻义（isEccentric）义项数 | 490 |
| 有形近词的词条数 | 1458（72.9%） |
| 有词根说明的词条数 | 673（33.6%） |
| isBasic = true 的词条数 | 439 |
| Tier A（人工例句）覆盖 | 300 / 300（100.0%） |
| 变形→原形映射条目 | 6631 |
| 数据包体积 | 3.42 MB |

## 2. 分块

| 块 | 词数 | 字节 | sha256（前 16 位） |
| --: | --: | --: | :-- |
| 0 | 300 | 382486 | `14c6cb4747b88c78` |
| 1 | 300 | 583639 | `41ea5b5a0482c4cf` |
| 2 | 300 | 594611 | `89e25a096a388213` |
| 3 | 300 | 607406 | `58c227f8ba5ad008` |
| 4 | 300 | 613821 | `fcefc77a5b1f4d9e` |
| 5 | 300 | 536602 | `c1b486280e4322d1` |
| 6 | 200 | 365827 | `77c18dcd08c6ae7b` |

## 3. 阈值与口径

| 项 | 取值 | 说明 |
| :-- | :-- | :-- |
| 基础词硬排除 | frq ≤ 600 | 极高频基础词不入选 |
| isBasic 标记 | frq ≤ 1500 | 供 UI 默认过滤 |
| 生僻词上限 | frq ≤ 15000 | 超过则视为低频生僻，不入选 |
| 熟词僻义 | 非首义 + 该词 frq ≤ 2000（须为熟词）+ (share ≥ 0.15 或 freq ≥ 5) + 词性与首义不同 + 每词最多 1 个 | PRD §4.2 + 无真题语料下的近似约束 |
| 形近词 | 编辑距离 ≤ 2，每词最多 3 个 | PRD §4.2 |
| 例句 | 每义项 ≥ 1 句，100%% ADAPTED | 无真题原句 |

## 4. 抽查 10 词

### analysis `/ə'næləsis/`（基础词）

- `s_analysis_n_investigation` **n.** 分析（对数据或问题的系统考察） — 近似频次 31，占比 100%
  - 英释：an investigation of the component parts of a whole and their relations in making up the whole
- 例句：`A detailed analysis of the survey data revealed a clear gap between urban and rural schools.`
  - 对调查数据的详细分析揭示了城乡学校之间的明显差距。（句中形式：analysis；仿真例句（人工撰写，用于演示该义项用法））
- 形近词：`analyst`(ROOT) 共享词根「analys」：analysis 意为分析，analyst 意为分析者、精神分析学家。

### constant `/'kɒnstənt/`

- `s_constant_adj_steadfast` **adj.** 持续不断的、不变的 — 近似频次 25，占比 100%
  - 英释：steadfast in purpose or devotion or affection
- 例句：`Residents complained of constant noise from the construction site.`
  - 居民抱怨建筑工地持续不断的噪音。（句中形式：constant；仿真例句（人工撰写，用于演示该义项用法））
- 形近词：`consultant`(SPELLING) 拼写在第 5 个字母处开始不同（constant / consultant）：前者意为常数、恒量，后者意为顾问、征询意见者。；`contact`(SPELLING) 拼写在第 4 个字母处开始不同（constant / contact）：前者意为常数、恒量，后者意为联系、交际、熟人。

### coffee `/'kɒfi/`（基础词）

- `s_coffee_n_beverage` **n.** 咖啡、咖啡色 — 近似频次 14，占比 64%
  - 英释：a beverage consisting of an infusion of ground coffee beans
- `s_coffee_x_x2` **** 咖啡、咖啡豆 — 近似频次 8，占比 36% · **熟词僻义**
- 例句：`The concept of coffee is central to the current debate.`
  - 「coffee」（咖啡、咖啡色）这一概念是当下这场讨论的核心。（句中形式：coffee；仿真例句（脚本按词性模板生成，用于演示该义项用法））
- 形近词：`confer`(SPELLING) 拼写在第 3 个字母处开始不同（coffee / confer）：前者意为咖啡、咖啡色，后者意为授予、带来。

### sensitive `/'sensitiv/`

- `s_sensitive_adj_responsive` **adj.** 敏感的、易感的、灵敏的 — 近似频次 12，占比 63%
  - 英释：responsive to physical stimuli
- `s_sensitive_x_x2` **** 敏感的、灵敏的、感度高的 — 近似频次 7，占比 37%
- 例句：`Many experts consider the current approach sensitive.`
  - 许多专家认为目前的做法是「sensitive」（敏感的、易感的、灵敏）的。（句中形式：sensitive；仿真例句（脚本按词性模板生成，用于演示该义项用法））

### trap `/træp/`

- `s_trap_n_device` **n.** 圈套、陷阱、诡计 — 近似频次 8，占比 47%
  - 英释：a device in which something (usually an animal) can be caught and penned
- `s_trap_v_v2` **v.** 设圈套、设陷阱 — 近似频次 4，占比 24%
- `s_trap_v_v3` **v.** 诱捕、诱骗、抓住 — 近似频次 3，占比 18%
- `s_trap_x_x4` **** 俘获; 陷井 — 近似频次 2，占比 12%
- 例句：`The report treats the trap as a key indicator of change.`
  - 该报告把「trap」（圈套、陷阱、诡计）当作衡量变化的一项关键指标。（句中形式：trap；仿真例句（脚本按词性模板生成，用于演示该义项用法））
- 形近词：`trip`(SOUND) 读音相近：trap 与 trip 发音接近；前者意为圈套、陷阱、诡计，后者意为旅行、绊倒、摔倒。；`tap`(SPELLING) 拼写在第 2 个字母处开始不同（trap / tap）：前者意为圈套、陷阱、诡计，后者意为轻打、水龙头。

### rule `/ru:l/`（基础词）

- `s_rule_n_principle` **n.** 规则、统治、控制 — 近似频次 12，占比 46%
  - 英释：a principle or condition that customarily governs behavior
- `s_rule_v_v2` **v.** 规定、统治、管理 — 近似频次 7，占比 27% · **熟词僻义**
- `s_rule_v_v3` **v.** 统治、管辖、裁定 — 近似频次 4，占比 15%
- `s_rule_x_x4` **** 规则、水线 — 近似频次 3，占比 12%
- 例句：`The concept of rule is central to the current debate.`
  - 「rule」（规则、统治、控制）这一概念是当下这场讨论的核心。（句中形式：rule；仿真例句（脚本按词性模板生成，用于演示该义项用法））
- 形近词：`role`(SOUND) 读音相近：rule 与 role 发音接近；前者意为规则、统治、控制，后者意为角色、职责、任务。；`rub`(SPELLING) 拼写在第 3 个字母处开始不同（rule / rub）：前者意为规则、统治、控制，后者意为摩擦、困难、障碍。

### investigation `/in.vesti'geiʃən/`（基础词）

- `s_investigation_n_work` **n.** 调查、审查 — 近似频次 15，占比 65%
  - 英释：the work of inquiring into something thoroughly and systematically
- `s_investigation_x_x2` **** 调查、调查研究 — 近似频次 8，占比 35% · **熟词僻义**
- 例句：`The report treats the investigation as a key indicator of change.`
  - 该报告把「investigation」（调查、审查）当作衡量变化的一项关键指标。（句中形式：investigation；仿真例句（脚本按词性模板生成，用于演示该义项用法））
- 形近词：`investigator`(ROOT) 共享词根「investigat」：investigation 意为调查、审查，investigator 意为调查者、审查者。

### philosophy `/fi'lɒsəfi/`

- `s_philosophy_n_rational` **n.** 哲学、人生观、哲学思想 — 近似频次 19，占比 100%
  - 英释：the rational investigation of questions about existence and knowledge and ethics
- 例句：`Recent research has paid growing attention to the philosophy.`
  - 近期研究对「philosophy」（哲学、人生观、哲学思想）给予了越来越多的关注。（句中形式：philosophy；仿真例句（脚本按词性模板生成，用于演示该义项用法））

### characterize `/'kærəktəraiz/`

- `s_characterize_v_characteristic` **v.** 描绘...的特性、刻划...的性格 — 近似频次 16，占比 100%
  - 英释：be characteristic of
- 例句：`characterizing is frequently discussed in the literature on this topic.`
  - 关于这一主题的文献中，「characterize」（描绘...的特性、刻划...的性格）经常被提及。（句中形式：characterizing；仿真例句（脚本按词性模板生成，用于演示该义项用法））

### lens `/lenz/`

- `s_lens_n_transparent` **n.** 透镜、镜头、镜片 — 近似频次 10，占比 67%
  - 英释：a transparent optical device used to converge or diverge transmitted light and to form images
- `s_lens_v_v2` **v.** 给...摄影 — 近似频次 5，占比 33%
- 例句：`The concept of lens is central to the current debate.`
  - 「lens」（透镜、镜头、镜片）这一概念是当下这场讨论的核心。（句中形式：lens；仿真例句（脚本按词性模板生成，用于演示该义项用法））
- 形近词：`less`(SPELLING) 拼写在第 3 个字母处开始不同（lens / less）：前者意为透镜、镜头、镜片，后者意为较少、较小。；`lead`(SPELLING) 拼写在第 3 个字母处开始不同（lens / lead）：前者意为透镜、镜头、镜片，后者意为铅、铅条、领导。

## 5. 已知缺口

1. **同义词（Word.synonyms）为空数组**：ECDICT 未提供可靠同义词数据，为避免臆造，本版本留空。**ADR-005（2026-10-21）裁定 M1 不做、列 P1**：WordNet 同义集按 enDef 义项对齐后覆盖仅 61.6%（1232/2000）且约 20~30% 义项错配，US-08 标杆示例（increase 对 surge/escalate/proliferate）无法由同义集产出；Moby Thesaurus 无义项（中位 141 个/词）不可用、Webster 1913 覆盖 31% 且词汇过时、BabelNet 许可不符（CC BY-NC-SA）。P1 走独立 `scripts/etl_synonyms.py`（WordNet + 义项对齐 + 黑名单 + 抽检 100 词，约 3 人日），UI 契约「synonyms 非空才渲染」。
2. **词根（etymology）覆盖率低**：仅在 ECDICT wordroot.txt 明确收录该词时生成，不做推测性词源分析。
3. **权重为近似值**：无真题语料，senseWeight 由公开词频信号合成，examStats.IELTS.kind 恒为 'ESTIMATED'、sources 非空；旧字段 freq/share/years/approx 已随 senseWeight 迁移移除，校验器会拒绝其重现。
4. **音标未区分英美**：ECDICT phonetic 以英式为主，phoneticUs 留空，UI 不应宣称提供美音音标。
5. **形近词 tip 为脚本生成**：基于实际拼写差异与双方释义，非人工润色，Tier A 词可在后续版本中人工复核。
