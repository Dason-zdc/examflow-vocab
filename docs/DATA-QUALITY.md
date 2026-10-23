# IELTS 数据包 · 数据质量自检报告

> 由 `scripts/etl_build_pack.py` 自动生成，重新构建时会覆盖。
> 数据包版本：**v1.6.0** · 生成时间：2026-10-23T10:55:15+08:00
> 交付校验：`python scripts/etl_build_pack.py --verify-only` 通过（sha256 / bytes / 词条与义项 ID 唯一性 / 例句覆盖 / 形近词约束 / 近义词中文 / examStats 新Schema）
> 覆盖率复核：`python scripts/check_pack_coverage.py`

## 1. 总量

| 指标 | 数值 |
| :-- | --: |
| 词数 | 1999 |
| 义项总数 | 2957 |
| 每词平均义项数 | 1.48 |
| 例句总数 | 2526 |
| 例句覆盖率（义项维度） | 85.4% |
| 无例句义项（sentencePending） | 592 |
| 有 ≥1 条英释的词 | 1976（98.8%） |
| **所有义项都有英释的词** | **1496（74.8%）** |
| 有英释的义项 | 2384（80.6%） |
| 熟词僻义（isEccentric）义项数 | 311 |
| 有形近词的词条数 | 1457（72.9%） |
| 有词根说明的词条数 | 672（33.6%） |
| isBasic = true 的词条数 | 438 |
| Tier A（人工例句）覆盖 | 300 / 300（100.0%） |
| 变形→原形映射条目 | 6631 |
| 数据包体积 | 2.93 MB |

> 义项级同义替换由 `scripts/etl_synonyms.py` 单独产出，覆盖率见 `docs/DATA-QUALITY-SYNONYMS.md`。

## 2. 分块

| 块 | 词数 | 字节 | sha256（前 16 位） |
| --: | --: | --: | :-- |
| 0 | 300 | 401590 | `b4e86a81f110d97f` |
| 1 | 300 | 441720 | `023baf069eea5214` |
| 2 | 300 | 452378 | `f46724a5534ee9aa` |
| 3 | 300 | 485037 | `abd4998cd6ba6313` |
| 4 | 300 | 503838 | `7ba173d559673cda` |
| 5 | 300 | 394511 | `54e064f15adf95ac` |
| 6 | 199 | 250719 | `2437ee42887543e7` |

## 3. 阈值与口径

| 项 | 取值 | 说明 |
| :-- | :-- | :-- |
| 基础词硬排除 | frq ≤ 600 | 极高频基础词不入选 |
| isBasic 标记 | frq ≤ 1500 | 供 UI 默认过滤 |
| 生僻词上限 | frq ≤ 15000 | 超过则视为低频生僻，不入选 |
| 义项粒度 | 同词性合并为 1 个义项，每词最多 6 个 | P0-1：中文一行读完，英释可按序对齐 |
| 英文释义对齐 | 按「词性 + 同词性顺序」一一对应，对不上留空 | **严禁跨词性串释义** |
| 熟词僻义 | 非首义 + 该词 frq ≤ 2000（须为熟词）+ (senseWeight ≥ 60 或占比 ≥ 0.15) + 词性与首义不同 + 每词最多 1 个 | PRD §4.2 + 无真题语料下的近似约束 |
| 形近词 | 编辑距离 ≤ 2，每词最多 3 个 | PRD §4.2 |
| 同义替换 | 按 WordNet 义项分组（synset），候选五态分级 | 由 etl_synonyms.py 生成，见 ADR-006 |
| 例句 | 每义项 ≥ 1 句或标 sentencePending，100%% ADAPTED | 无真题原句 |
| 领域行 | 丢弃 `[建]`/`[计]` 等 `[领域]` 行（本次 977 行） | 领域标注不是词性，中文与主词性重复 |

## 4. 抽查 10 词

### analysis `/ə'næləsis/`（基础词）

- `s_analysis_n_investigation` **n.** 分析（对数据或问题的系统考察） — 估计权重 68（CORE）
  - 英释：an investigation of the component parts of a whole and their relations in making up the whole
- 例句：`A detailed analysis of the survey data revealed a clear gap between urban and rural schools.`
  - 对调查数据的详细分析揭示了城乡学校之间的明显差距。（句中形式：analysis；仿真例句（人工撰写，用于演示该义项用法））
- 形近词：`analyst`(ROOT) 共享词根「analys」：analysis 意为分析，analyst 意为分析者、精神分析学家。

### commission `/kə'miʃən/`

- `s_commission_n_fee` **n.** 委员会；委托；佣金 — 估计权重 65（CORE）
  - 英释：a fee for services rendered based on a percentage of an amount received or collected or agreed to be paid (as distinguished from a salary)
- 例句：`An independent commission was set up to review the fares.`
  - 成立了一个独立委员会来审查票价。（句中形式：commission；仿真例句（人工撰写，用于演示该义项用法））

### religion `/ri'lidʒən/`（基础词）

- `s_religion_n_strong` **n.** 宗教、信仰 — 估计权重 41（ADVANCED）
  - 英释：a strong belief in a supernatural power or powers that control human destiny
- 例句：`The Baha'i Faith is a very cool religion.`
  - 巴哈伊信仰是个很棒的宗教。（句中形式：religion；语料例句（Tatoeba 英中句对，CC BY 2.0 FR））
- 形近词：`religious`(ROOT) 共享词根「religio」：religion 意为宗教、信仰，religious 意为宗教性的、虔诚的、宗教上的。；`relation`(SPELLING) 拼写在第 4 个字母处开始不同（religion / relation）：前者意为宗教、信仰，后者意为关系、联系、叙述。

### pink `/piŋk/`

- `s_pink_n_light` **n.** 粉红色、石竹花、化身、典范 — 估计权重 39（ADVANCED）
  - 英释：a light shade of red
- `s_pink_adj_adj2` **adj.** 粉红的、石竹科的、比较激进的、脸色发红的 — 估计权重 30（EXTENDED）
- `s_pink_v_sound` **v.** 刺、扎、刺痛、射伤 — 估计权重 26（EXTENDED）
  - 英释：sound like a car engine that is firing too early
- 例句：`She was wearing pink panties under the skirt.`
  - 裙子下她穿著一条粉红色的内裤。（句中形式：pink；语料例句（Tatoeba 英中句对，CC BY 2.0 FR））
- 形近词：`pin`(SPELLING) 拼写在第 3 个字母处开始不同（pink / pin）：前者意为粉红色、石竹花、化身，后者意为大头针、针、别针。；`pine`(SPELLING) 拼写在第 4 个字母处开始不同（pink / pine）：前者意为粉红色、石竹花、化身，后者意为松树、松木。

### flash `/flæʃ/`

- `s_flash_n_sudden` **n.** 闪光、闪现、一瞬间 — 估计权重 38（ADVANCED）
  - 英释：a sudden intense burst of radiant energy
- `s_flash_v_v2` **v.** 闪光、闪现、反射、使闪光 — 估计权重 29（EXTENDED）
- 例句：`The flash wasn't working, so he couldn't take a picture in the dark.`
  - 因为闪光灯坏了，他不能在黑暗中拍照。（句中形式：flash；语料例句（Tatoeba 英中句对，CC BY 2.0 FR））
- 形近词：`flesh`(SOUND) 读音相近：flash 与 flesh 发音接近；前者意为闪光、闪现、一瞬间，后者意为肉、肉体、肉欲。；`flag`(SOUND) 读音相近：flash 与 flag 发音接近；前者意为闪光、闪现、一瞬间，后者意为标志、旗标、旗子。

### term `/tə:m/`（基础词）

- `s_term_n_word` **n.** 术语、专有名词、期限、学期 — 估计权重 44（CORE）
  - 英释：a word or expression used for some particular thing
- `s_term_v_v2` **v.** 称、呼 — 估计权重 35（EXTENDED） · **熟词僻义**
- 例句：`We have two examinations during this term.`
  - 这个学期我们有两次考试。（句中形式：term；语料例句（Tatoeba 英中句对，CC BY 2.0 FR））
- 形近词：`terms`(SPELLING) 拼写在第 4 个字母处开始不同（term / terms）：前者意为术语、专有名词、期限，后者意为条件、条款、费用。；`team`(SPELLING) 拼写在第 3 个字母处开始不同（term / team）：前者意为术语、专有名词、期限，后者意为队、组。

### concept `/'kɒnsept/`（基础词）

- `s_concept_n_abstract` **n.** 观念、概念 — 估计权重 67（CORE）
  - 英释：an abstract or general idea inferred or derived from specific instances
- 例句：`This is an East Asian concept -- it's a little tricky to explain in Spanish.`
  - 这是一个东方的概念，用西班牙语不太好解释。（句中形式：concept；语料例句（Tatoeba 英中句对，CC BY 2.0 FR））
- 形近词：`concert`(ROOT) 共享词根「conce」：concept 意为观念、概念，concert 意为音乐会、和声、一致。；`concede`(ROOT) 共享词根「conce」：concept 意为观念、概念，concede 意为承认、退让。

### error `/'erə/`

- `s_error_n_misconception` **n.** 错误、过失、失误、误差 — 估计权重 65（CORE）
  - 英释：a misconception resulting from incorrect information
- 例句：`Without music, life would be an error.`
  - 没有音乐的话，生命是错误的。（句中形式：error；语料例句（Tatoeba 英中句对，CC BY 2.0 FR））
- 形近词：`terror`(SPELLING) 拼写在第 1 个字母处开始不同（error / terror）：前者意为错误、过失、失误，后者意为恐怖、可怕的人。；`mirror`(SPELLING) 拼写在第 1 个字母处开始不同（error / mirror）：前者意为错误、过失、失误，后者意为镜子、写真、典范。

### tremendous `/tri'mendəs/`

- `s_tremendous_adj_extraordinarily` **adj.** 巨大的、非常的、可怕的 — 估计权重 49（CORE）
  - 英释：extraordinarily large in size or extent or amount or power or degree; that a whole civilization should be dependent on technology"- Walter Lippman
- 例句：`The rocket travels at a tremendous speed.`
  - 火箭飞得极快。（句中形式：tremendous；语料例句（Tatoeba 英中句对，CC BY 2.0 FR））

### deadly `/'dedli/`

- `s_deadly_adj_causing` **adj.** 致命的、致死的 — 估计权重 38（ADVANCED）
  - 英释：causing or capable of causing death
- `s_deadly_adv_adv2` **adv.** 非常、如死一般地 — 估计权重 29（EXTENDED）
- 例句：`To him this is a deadly blow.`
  - 这对他来说是致命的打击。（句中形式：deadly；语料例句（Tatoeba 英中句对，CC BY 2.0 FR））
- 形近词：`dead`(SPELLING) 拼写在第 4 个字母处开始不同（deadly / dead）：前者意为致命的、致死的，后者意为死的、不活泼的、麻木的。；`deal`(SPELLING) 拼写在第 4 个字母处开始不同（deadly / deal）：前者意为致命的、致死的，后者意为交易、协定、数量。

## 5. 已知缺口

1. **逐义项英释的上限由 ECDICT 决定**：ECDICT `definition` 列对多数词条只保留了前 1~2 个词性的释义（后续词性被源数据截断），因此「中文里有、英释里没有」的词性无法同词性对齐。本项目遵守「对不上就留空、严禁跨词性串释义」，故该比例停在 74.8%（本次 1496 词全部义项有英释）。彻底解决需要引入完整 WordNet 数据（P1 数据管线），不是前端能补的。
2. **同义替换由独立 ETL 产出**：`scripts/etl_synonyms.py` 直读 Open English WordNet 2021，按 synset 分组写入 `sense.synonymGroups`，候选分五态并给改写模板。本脚本不再产出词级 `synonyms`，重建数据包后必须再跑一次同义 ETL（ADR-006）。
3. **词根（etymology）覆盖率低**：仅在 ECDICT wordroot.txt 明确收录该词时生成，不做推测性词源分析。
4. **权重为近似值**：无真题语料，senseWeight 由公开词频信号合成，examStats.IELTS.kind 恒为 'ESTIMATED'、sources 非空；旧字段 freq/share/years/approx 已随 senseWeight 迁移移除，校验器会拒绝其重现。
5. **音标未区分英美**：ECDICT phonetic 以英式为主，phoneticUs 留空，UI 不应宣称提供美音音标。
6. **形近词 tip 为脚本生成**：基于实际拼写差异与双方释义，非人工润色，Tier A 词可在后续版本中人工复核。
