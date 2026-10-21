# OPEN-DECISIONS — ExamFlow Vocab 未决项登记

> 用途：登记本次架构定稿后**仍然悬而未决**的事项，避免它们在实现期被当作已定、或在评审时被反复重开。
> 字段口径：`Date` 登记日期 / `Source` 来源 / `Open Item` 待决内容 / `Current Leaning` 当前倾向 / `Blocked By` 阻塞方 / `Status` 状态。
> 规则：任何一项状态变为 `Resolved` 时，**必须同步修改** `docs/02-ARCHITECTURE.md` 或对应 ADR，再关闭本条。禁止只在会话里口头解决。

## 1. 需 team-lead / 产品决策

| ID | Date | Source | Open Item | Current Leaning | Blocked By | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| OD-01 | 2026-10-21 | 架构 vs PRD §8.1 | React 版本：PRD 写 18，本 Spec 定 19.3.1（registry 实测 latest，18.3.1 为末版 18.x） | 采用 19.3.1；若坚持 18.3.1，改动仅 `package.json` 4 行，无代码影响 | team-lead 确认 | Open |
| OD-02 | 2026-10-21 | 架构 vs PRD §1.2 | 浏览器下限：PRD 写 iOS Safari 16+，Tailwind v4 官方要求 Safari 16.4 / Chrome 111 / Firefox 128 | 上调下限至 16.4；若必须守 16.0 则改用 `tailwindcss@3.4.19` + PostCSS 并重写令牌定义 | team-lead + 产品（目标机型分布） | Open |
| OD-03 | 2026-10-21 | 实测 ts-fsrs 5.4.2 | 算法版本：PRD §5.5 与原型按 FSRS-4.5（17 权重）描述，实测库默认 `default_w.length === 21`、`FSRSVersion === "v5.4.2 using FSRS-6.0"` | 采纳 FSRS-6 默认权重（PRD 要求"用内置默认值"），北极星指标与全部回归基线按 FSRS-6 重算；原型数值不作为验收基线 | team-lead 知悉 + 数据侧确认指标口径 | Open |
| OD-04 | 2026-10-21 | PRD §5.3 / §5.5 标注【假设】 | 考期参数：留存率阈值（7 / 30 天 → 0.95 / 0.93 / 0.90）、过轮窗口 `B = 7` 或 `max(1, floor(D/3))`、每日上限 `M_new=50 / M_rev=300`、层级权重 1.0 / 0.7 / 0.4、重现间隔 3 张 / 60 秒、核心卡前 30% | 全部按 PRD 假设值实现，但**集中于 `scheduler.ts` / `planner.ts` 常量区**，M1 校准只改值不改结构 | M1 复习日志校准 | Open |
| OD-05 | 2026-10-21 | 实测 registry | ts-fsrs 版本漂移：`6.0.0-beta.*` 已发布到 beta.15；`Card.elapsed_days` / `ReviewLog.elapsed_days` / `last_elapsed_days` 本版已标 `@deprecated`（6.0.0 移除） | 精确锁 `"ts-fsrs": "5.4.2"`；持久化结构不依赖 deprecated 字段；升 6.x 前必须用固定 ReviewLog 回放回归 | 无（架构侧已兜底） | Mitigated |
| OD-06 | 2026-10-21 | ADR-003 | `schemaVersion` 迁移策略：v1 是首版，暂无真实迁移样本；需定"迁移失败如何回滚"与"迁移前自动备份落在哪里（下载 / IndexedDB 快照）" | 迁移前自动下载一份 JSON 备份文件；迁移失败保留旧库副本并提示用户联系导出 | 产品（失败文案与引导） | Open |
| OD-07 | 2026-10-21 | PRD §9 / ADR-003 | iOS Safari 数据清理的产品兜底：`persist()` 在 iOS 16 前恒 false 且仅 Home Screen PWA 有资格 | 已定技术动作（手势内申请 + 如实告知 + 7 天备份提醒）；**产品侧需决定提醒频次与"添加到主屏幕"引导时机** | 产品 | Open |
| OD-08 | 2026-10-21 | ADR-004 | SW 更新提示：用户点"稍后"后的留存策略、是否存在强制更新阈值 | 提示条常驻至用户处理；暂不设强制更新 | 产品 | Open |
| OD-09 | 2026-10-21 | PRD §8.1 / §7.1 | 静态托管与 CDN 选型（数据包分发） | 任意支持 HTTPS + 版本化路径的静态托管；MVP 不绑定厂商 | team-lead（成本/备案） | Open |

## 2. 需数据侧 / 法务确认（影响数据包契约）

| ID | Date | Source | Open Item | Current Leaning | Blocked By | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| OD-10 | 2026-10-21 | team-lead 任务书 | 义项考频为**近似值**：MVP 用 ECDICT + WordNet + 公开词频（Oxford 3000/5000、AWL）生成，**非真题语料统计**。UI 与文档须如实表述，不得暗示为真题考频 | 数据包 `license` 字段与"关于"页写明数据构成与推导方式；卡片上的考频条标注来源类型 | 数据侧给出措辞 | Open |
| OD-11 | 2026-10-21 | team-lead 任务书 | 例句 100% 为仿真例句并显式标注 `ADAPTED` | `ExampleSentence.provenance` 一律 `{ type: 'ADAPTED', note: ... }`；`REAL_EXAM` 分支仅在类型中保留，MVP 不产出 | 无（已定） | Resolved-in-Spec |
| OD-12 | 2026-10-21 | PRD §12 Q-02 | 能否在产品中展示真题原句（法务） | MVP 不展示，走仿真例句（见 OD-11） | 法务结论 | Open |
| OD-13 | 2026-10-21 | PRD §12 Q-01 | 首发考试：PRD 默认考研，team-lead 任务书定为 IELTS | 按 IELTS 收敛；`ExamCode` 枚举保留全部取值，MVP 只发布 IELTS 包 | team-lead 确认 | Open |
| OD-14 | 2026-10-21 | PRD §12 Q-04 | 基础词排除表来源与授权（M-08 入门测试依赖） | 优先公开词表（Oxford 3000 等可商用来源）；自建需授权复核 | 数据 + 法务 | Open |
| OD-15 | 2026-10-21 | 架构 §6.3 | `lemma-map.json` 按 PRD 放在 `/packs/{exam}/{version}/` 下，但"变形 → 原形"本质是语言级数据，按考试重复发布会浪费带宽 | MVP 遵循 PRD 路径；扩第二个考试包时再评估抽为共享文件 | 无（MVP 单包） | Deferred |

## 3. 架构侧已兜底、需知悉

| ID | Date | Source | Open Item | Current Leaning | Blocked By | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| OD-16 | 2026-10-21 | 实测 ts-fsrs 5.4.2 | `maximum_interval` 不可依赖：新卡完全忽略该参数（mi=1 时 Good 仍给 3 天），复习卡可能返回 `maximum_interval + 1` | 自建 `clampInt(scheduled_days, 1, maxIntervalFor(D))` 作为唯一可信截断路径（架构 §4.3 / §5.1） | 无（已定） | Resolved-in-Spec |
| OD-17 | 2026-10-21 | 实测 ts-fsrs 5.4.2 | `enable_short_term` 若开启会给出分钟级 `due`，与"每日首评"冲突 | `buildFsrs` 写死 `enable_short_term: false`，并用单测断言该参数 | 无（已定） | Resolved-in-Spec |
| OD-18 | 2026-10-21 | 实测 ts-fsrs 5.4.2 | `enable_fuzz` 本版默认值为 `false`，与"生产建议开启"相反 | 生产显式 `true`，单测显式 `false`，两处都写死不依赖默认 | 无（已定） | Resolved-in-Spec |
| OD-19 | 2026-10-21 | 架构 §1.10 | 数据包运行时校验是手写断言（约 60 行）而非 Zod | 维持手写：数据包由我方 CDN 发布且已过 sha256，无外部不可信输入面 | 若 P1 引入第三方数据源则重开 | Deferred |
| OD-20 | 2026-10-21 | 架构 §11.20 | 2000 词数据包 `JSON.parse` 在中端安卓可能阻塞主线程数百 ms | 首块随包发布，其余块按需下载并在空闲时解析，解析结果立刻落 `packChunks`，之后启动不再解析 | M1 性能实测校准 | Open |

## 4. 交付缺口收口（README §7 已知缺口）

| ID | Date | Source | Open Item | Current Leaning | Blocked By | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| OD-21 | 2026-10-21 | README §7 G-1 / UIUX P10 | 快捷键缺 4 键：`→`/`Enter`（下一个）、`R`（词根）、`F`（形近词）；`S`=拼写为 P1 剔除（D-07） | **已补齐**（2026-10-21，frontend-2）：`→`/`Enter` 复用 next handler；R/F 驱动背面折叠块（换卡重置）；折叠 state 上移 StudyView；Enter/Space 在可激活元素上让位原生激活；按键让位口径随收尾批次固化 | 无 | Resolved |
| OD-22 | 2026-10-21 | README §7 G-2 | 形近词（confusables）不可跳转，只能看文字列表 | **已补齐**（2026-10-21，frontend-2）：ConfusableBlock 项改 button 上抛 `onOpenWord`；`WordPreviewModal` 弹词条摘要（音标/义项/估计权重，查不到显示「词库未收录」）；Esc/遮罩关闭 + 焦点陷阱；弹窗打开时快捷键让位；不 import storage，查词由 StudyView 经 dictionary 完成 | 无 | Resolved |
| OD-23 | 2026-10-21 | README §7 G-3 | synonyms 数据 0/2000：US-08 同义词区块在全部词上为空 | **已裁定：M1 不做，列 P1**（ADR-005）。WordNet 义项对齐后覆盖仅 61.6% 且 20~30% 错配，US-08 标杆示例（increase 对 surge/escalate/proliferate）无法由同义集产出；Moby 无义项量级不可用、Webster 1913 覆盖 31% 且过时、BabelNet 许可不符；词根派生语义不同不冒充同义。P1 管线约 3 人日（独立 `etl_synonyms.py` + 抽检 100 词） | devops-2 调研结论 | Resolved（ADR-005） |

## 5. 与 PRD §12 待决策问题的对应

| PRD ID | 对应本表 | 说明 |
| :-- | :-- | :-- |
| Q-01 首发考试 | OD-13 | team-lead 定 IELTS，待书面确认 |
| Q-02 真题原句 | OD-12 / OD-11 | MVP 走仿真例句 |
| Q-03 义项标注预算 | — | 数据侧事项，不影响架构 |
| Q-04 基础词表来源 | OD-14 | 影响 M-08 与数据包 `isBasic` 字段 |
| Q-05 AI 方案 | — | P1，MVP 不做（架构 §13） |
| Q-06 匿名统计 | — | 默认关闭且不上报（架构 §13） |
| Q-07 是否加 Easy 评分 | — | MVP 不加，评分映射只到 Good（ADR-002 第 8 条） |
