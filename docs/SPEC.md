# ExamFlow Vocab — 实现契约（Implementation Spec）

> 角色：team-lead（实现侧契约）
> 日期：2026-10-21
> 状态：**现行契约**。与 `docs/01-PRD.md`（需求基线）、`docs/02-ARCHITECTURE.md`（设计记录）
> 冲突时，以本文描述**已落地代码**的部分为准；若要改变本文，先改本文再改代码。
> 上游裁定记录：`02-ARCHITECTURE.md §0.4`（React 18 / Tailwind 3 偏离裁定）。

---

## 1. 钉死的版本（禁止随手升级）

| 包 | 版本 | 说明 |
| :-- | :-- | :-- |
| react / react-dom | **18.3.1** | PRD §8.1 基线；架构文档 D-1 偏离已裁定不采纳（见 02-ARCH §0.4） |
| typescript | 5.9.3 | 严格模式 |
| vite | 7.3.7 | 构建 |
| tailwindcss | 3.4.19 + PostCSS 8 | 令牌走 `tailwind.config.ts` → CSS 变量双层映射 |
| ts-fsrs | **5.4.2** | 精确锁版本：调度算法行为随小版本变化，升级需重跑 13 项 scheduler 测试 |
| dexie | **4.4.6** | `bulkUpdate(keysAndChanges: [{key, changes}])` 单参形式；`between()` 默认排上界 |
| dexie-react-hooks | ^1.1.7 | `useLiveQuery` 依赖必须稳定引用 |
| lucide-react | 1.60.0 | 图标唯一来源（门禁 4） |
| vite-plugin-pwa | 2.0.0 | `registerType: 'prompt'`，generateSW |
| vitest | 3.2.7 | `test.include` 必须覆盖 `.tsx`（曾因只匹配 `.ts` 导致 Provider 测试从未运行） |
| fake-indexeddb | 6.2.6 | 存储层测试底座 |
| @testing-library/react | ^16.3.0 | Provider 全流程测试 |

Node 引擎要求：`>= 20.19.0`（package.json engines）。

## 2. 分层规则与依赖方向

```
ui  ──► app ──► domain
 │        │
 │        ▼
 │     storage / content
 ▼
（ui 不得直接 import storage；不得出现 db.transaction）
```

| 层 | 目录 | 允许 | 禁止 |
| :-- | :-- | :-- | :-- |
| domain | `src/domain/` | 纯函数 + 可注入 `Clock`；import types / ts-fsrs | DOM、IndexedDB、Date.now（经 Clock） |
| content | `src/content/` | 数据包解析、校验、词典查询 | 写用户数据 |
| storage | `src/storage/` | Dexie 表定义、序列化、`openDatabase` | 业务规则 |
| app | `src/app/` | 用例编排、`db.transaction`（**仅 transactions.ts**）、useLiveQuery hooks | JSX（Provider 除外） |
| ui | `src/ui/` | 渲染、hooks 消费 app 用例 | 直接写 Dexie、直接 import storage（门禁 6 对入口、纪律对全层） |

违反即被门禁拦下（见 §10）或 review 打回。

## 3. 目录与文件地图（含有效行数）

```
src/
├── App.tsx                         11   ErrorBoundary 包裹 ExamFlowApp（瘦入口）
├── main.tsx                        17   挂载 + registerSW({ immediate: true })
├── domain/
│   ├── types.ts                   190   Card / ReviewLog / Settings / SynonymGroup（义项级同义）/ EXAM_CODES
│   ├── clock.ts                    72   studyDayOf / daysToExam / createManualClock
│   ├── planner.ts                 232   planDaily / dailyNewCount / spreadSiblings / reviewPriority
│   ├── scheduler.ts               205   createScheduler / buildCardsForWord / 考期截断 / requestRetention
│   ├── sessionQueue.ts            235   SessionQueue（日内重现，积分制 ≥2 通关）
│   └── reviewCommitter.ts         180   beginReview / commitReview / undoReview / SessionUndo
├── content/
│   ├── packVerifier.ts            202   PackWord / PackChunk 类型 + 分块校验 + 义项级同义约束
│   ├── packLoader.ts              204   loadPack（分块 + manifest + lemma-map + 版本门）
│   ├── packCache.ts                51   IndexedDB 分块缓存（chunkKey / invalidateStaleChunks）
│   ├── dictionary.ts               93   PackDictionary（getWord 按 id 优先、回落 lemma）
│   └── dict.ts                    253   FullDictionary：全量词典分片懒加载 / 词形还原 / 前缀搜索 / Cache Storage
├── storage/
│   ├── db.ts                      107   ExamFlowDB（6 表）/ toCardRow / fromCardRow / openDatabase
│   └── backupService.ts           124   导出 / 解析 / 校验 / 序列化（fsrs 日期字段与 ISO 字符串互转）
├── app/
│   ├── onboardingUseCase.ts        92   ensureCardsForExam / ensureSettings / saveSettings / activateExam
│   ├── sessionBuilder.ts          147   buildSession / buildCardView / tierOfCard
│   ├── reviewUseCase.ts            38   commitReviewUseCase / undoReviewUseCase
│   ├── userWordsUseCase.ts         60   setStarred / setNote / resumeWord / resetExamProgress
│   ├── backupUseCase.ts            88   导入模式（overwrite/merge）+ 导出编排（ImportPlan）
│   ├── queries.ts                 157   useSettings / useCardsForExam / useDueCards / useCoverage …
│   ├── transactions.ts             89   applyCommitPlan / applyUndoPlan / applyImportPlan / applyResetPlan
│   ├── sessionReducer.ts          148   SessionState / Action / reducer（纯函数）
│   └── StudySessionProvider.tsx   252   会话副作用壳（start/reveal/prejudge/revise/commitAndNext/undo…；start 考期守卫）
├── styles/
│   ├── design-tokens.css          564   唯一原始色值处 + 语义令牌（--color-* 与短名双套）
│   ├── fonts.css                   26   @font-face 自托管（Inter / JetBrains Mono，latin woff2）
│   └── index.css                   33   @import + tailwind 指令 + base 层
└── ui/
    ├── ExamFlowApp.tsx            168   容器：Provider 最外层，Chrome 消费会话上下文；空考期走引导面板
    ├── ErrorBoundary.tsx           62   根级错误边界（getDerivedStateFromError + 重试 + 技术细节折叠）
    ├── AppHeader.tsx              129   品牌 + 考试切换 + 搜索 + 倒计时（null=未设置考期）+ 设置入口 + 本轮进度条
    ├── StudyView.tsx              265   学习页编排（CardFront / CardBack / 底部操作区 / 折叠块状态持有）
    ├── CardFront.tsx              166   词头 + 音标 + 估计权重徽章 + 挖空例句 + 3 档预判
    ├── CardBack.tsx               235   评分条 + 重排横幅 + 义项权重 + 例句高亮 + 笔记
    ├── CardBackBlocks.tsx         208   背面可折叠区块：词根（R）/ 形近词 + 同义（F），受控渲染 + 点击上抛
    ├── SynonymGroups.tsx           49   义项级同义分组渲染（五态徽章 / 改写模板 / 不可用理由；库外候选也可点）
    ├── DictView.tsx               186   词典页：前缀搜索 + A–Z 分片浏览 + 详情 + 加入生词本
    ├── DictEntryView.tsx           29   词典条目展示（音标 / 词性释义 / 词频标签 / 来源声明）
    ├── useDictEntry.ts             29   弹窗内异步查词（数据包命中时不发请求）
    ├── WordPreviewModal.tsx       120   形近词词条弹窗：Esc/scrim 关闭 + 焦点陷阱 + 词典兜底
    ├── DailyPlanPanel.tsx          78   当日计划 + 警告 + 覆盖率 + 加学
    ├── VocabBookView.tsx          219   筛选 + 星标 + 恢复 + 两步确认重置 + 搜索
    ├── SettingsModal.tsx          237   焦点陷阱 + Esc + 字段校验
    ├── BackupPanel.tsx             88   7 天提醒 + 导出/导入
    ├── HotkeyPanel.tsx             35   快捷键口径展示
    ├── RoundSummaryView.tsx        51   轮次小结（开始下一轮 + 撤销）
    ├── primitives.tsx             152   Button / IconButton / Panel / Badge / ProgressBar / Kbd / Notice / StatBlock
    ├── icons.ts                    81   lucide 唯一出口（ICON_SIZE 三档 + ICON_STROKE）
    ├── format.ts                   68   weightLabel「估计权重」/ formatDueLabel（null=未设置考期）/ TIER_LABEL …
    ├── speech.ts                   15   Web Speech 发音降级
    ├── useStudyHotkeys.ts          99   全键位 + 按键让位（输入类全屏蔽 / 可激活元素仅让位 Space+Enter）
    └── useExamFlow.ts             220   数据编排 hook（openDatabase→ensureSettings→loadPack→…）
```

测试文件 40 个 / 254 用例，与源文件同目录（`*.test.ts(x)`），清单见 `docs/04-TEST-PLAN.md`。

## 4. 数据契约

### 4.1 数据包（`public/packs/IELTS/`）

```
manifest.json    { exam, version, minAppVersion, generatedAt, wordCount: 2000,
                   chunkSize: 300, chunks: 7, lemmaMap: 'lemma-map.json',
                   deprecatedWordIds, frequencyMethod, provenanceNote, sources }
chunk-N.json     { exam, version, chunk, words: PackWord[≤300] }   （N = 0..6）
lemma-map.json   { surface → lemma }（6631 条）
```

- `PackWord.senses[].examStats[exam] = { senseWeight, tier: 'CORE'|'ADVANCED'|'EXTENDED',
  kind: 'ESTIMATED'（恒定）, sources[], isEccentric }`
- `PackWord.senses[].synonymGroups[] = { synset, gloss, frame?, candidates[] }`（v1.6.0 起，可选）
  - `candidates[] = { lemma, pos, status, inPack, cn?, note?, rewrite? }`
  - `status` 五态：`DIRECT` 可替换 / `INFERRED` 框架一致 / `REWRITE` 需改写（必带 `rewrite`）/
    `CONFLICT` 搭配不符（必带 `note`）/ `UNKNOWN` 待验证
  - 每卡 `synonymGroups ≤ 3` 组，每组 `candidates ≤ 4`，`lemma` 必须是 3~14 位小写单词且不等于本词
  - `cn` 只接受义项级释义：含 `、，；/` 等多义分隔符即拒绝（那是词级释义，不得冒充义项级）
  - **词级 `Word.synonyms` 已下线**，`packVerifier` 不再接受该字段；口径见 ADR-006
- **合规硬约定**：`kind` 只允许 `ESTIMATED`；`senseWeight` 是公开语料近似值；
  UI 文案禁止出现「真题 / 历年考频」表述（PRD §12.4，测试 T-19）
- 加载：`loadPack()` 分块拉取 + `packCache` 落 IndexedDB；`version` 与 `minAppVersion`
  不满足时拒绝加载并提示升级

### 4.1.1 全量词典（`public/dict/`，ADR-007）

与学习数据包**解耦**的静态资源，`build_dict.py` 产出，版本独立（内容变化由 `fingerprint` 反映）。

```
manifest.json  { version, fingerprint, generatedAt, count, formCount,
                 source: { name, url, license, used },
                 scope: { maxRank, tags[], forcedInclude: { packWords, synonymCandidates } },
                 shards: [{ id, file, entries, forms, bytes, sha256 }] }
a.json … z.json / _.json
               { e: [[lemma, phonetic, cn, rank], ...], f?: { form: lemma } }
```

- 分片键 = 词条首字母（`a`–`z`，其余 `_`）；查词只加载一个片，最大片约 478 KB。
- `cn` 为 ECDICT 中文释义压成单行（`n. 债券；vt. 结合`），按 `；` + 词性前缀切行；不含义项权重、例句、同义关系。
- `f` 是分片内不规则变形表（`mice → mouse`）；规则变形在运行时按后缀还原，且必须在词典中确有原形。
- 约束：`count = Σ shards[].entries`；每个分片 `sha256` / `bytes` 必须匹配；同一 lemma 不得跨片重复。
- 覆盖硬约束：数据包内**所有可点词**（词条 + 同义候选）必须可查，`--check-coverage` 逐词核对。

### 4.2 IndexedDB（Dexie，`SCHEMA_VERSION = 3`）

| 表 | 键 | 行类型 | 说明 |
| :-- | :-- | :-- | :-- |
| cards | id = `${exam}:${senseId}` | CardRow | `wordId` 存**数据包 ID**（`w_*`）；`fsrs` 内联 |
| reviewLogs | `${cardId}:${reviewedAt}` | ReviewLog | 含 rating / prejudged / corrected / fsrsBefore |
| userWordMeta | wordId | UserWordMeta | starred / note |
| customWords | wordId | CustomWord | 用户自定义词（MVP 无录入 UI，结构就绪） |
| settings | 'default' | SettingsRow | 含 exam / examDate / 上限 / 开关 / lastBackupAt |
| packChunks | `${exam}:${version}:${n}` | PackChunkRow | 数据包分块缓存 |

`CardRow`/`SettingsRow` = 领域类型 + Dexie 索引要求；`toCardRow` / `fromCardRow` 是唯一转换点。

### 4.3 备份文件（`examflow-backup` v1）

`{ format, version, exportedAt, settings, cards, reviewLogs, userWordMeta, customWords }`；
fsrs 的 `due` / `last_review` 序列化为 ISO 字符串，导入时重建 `Date`；`validateBackup`
逐数组校验，缺字段抛 `BackupFormatError`。

## 5. 核心领域接口

```ts
// planner
planDaily(input: DailyPlanInput): DailyPlan
  // n_new = min(M_new, ceil(N / max(1, D-B)))；B = overrunWindowDays(D)（D≤21 时 max(1, floor(D/3))）
  // 过轮窗口（D ≤ B）不引新卡；输出 warnings: CANNOT_FINISH | BACKLOG | EXAM_PAST | OVERRUN_WINDOW
dailyNewCount({ remainingCount, daysToExamValue, maxNewPerDay, allowInOverrunWindow? }): number
reviewPriority(tier, retrievability): number          // TIER_WEIGHT[tier] * (1 - R)
spreadSiblings({ cards, studiedWordIds?, ranking? }): { selected, deferred }
  // 同词当日 1 张：有 New 态兄弟卡优先 PRIMARY，否则取优先级最高

// scheduler
createScheduler(options?): Scheduler                  // schedule(card, rating, now, ctx) → ScheduleResult
requestRetentionForDaysToExam(d): number              // 考期越近 retention 越高
maximumIntervalForDaysToExam(d): number               // 考期截断上限 max(1, D-1)
buildCardsForWord(word, exam, { now, maxCardsPerWord? }): Card[]
  // 主义项卡 + 每个熟词僻义 1 张，≤3 张；cardIdOf(exam, senseId)

// sessionQueue（微观日内重现）
new SessionQueue(cardIds, { clock })
  snapshot(): { currentId, remaining, requeued, passedCount, roundIndex }
  requeue(rating, opts): RequeueResult                // PASSED | REINSERTED | DEFERRED（积分 ≥2 通关）
  summary(): RoundSummary                             // { learned, passed, pending }

// reviewCommitter
beginReview(card, rating, now): PendingReview         // 正面预判
reviseRating(pending, rating): PendingReview          // 背面修正（记录 corrected）
commitReview(input): CommitResult                     // { card, log, nextDue, rawInterval, truncatedInterval }
undoReview(card, log): Card                           // 逐字段还原
class SessionUndo                                     // 单层撤销栈（REVIEW | SUSPEND）
```

**ts-fsrs 校验坑**：Review 态卡的 `difficulty` 必须在 [1,10] 且 `last_review` 非空；
`createEmptyCard()` 产出的是 null/0，测试夹具构造 Review 卡必须显式补这两个字段。

**考期截断实现**：ts-fsrs 的 `maximum_interval` 参数实测不可依赖，改为对
`ScheduleResult` 的原始间隔做 `min(I_fsrs, max(1, D-1))` 硬截断（`scheduler.ts`）。

## 6. app 用例接口

```ts
ensureCardsForExam(db, dictionary, exam, { excludeBasic, batchSize?, onProgress? }): Promise<EnsureCardsResult>
ensureSettings(db, defaults, examDate): Promise<Settings>
saveSettings(db, next): Promise<Settings>
activateExam(db, dictionary, exam): Promise<{ settings, cards }>

buildSession({ cards, dictionary, exam, now, settings, scheduler?, clock?, studiedWordIds? }): BuiltSession
  // 到期卡按 reviewPriority 排序取 M_rev；新卡按 senseWeight 取 n_new；
  // 合并后 spreadSiblings；buildCardView 解析失败的卡跳过（getWord 失败 = 数据缺陷，静默跳过）
createSessionQueue(cardIds, clock?): SessionQueue

commitReviewUseCase(db, input): Promise<void>         // 内部走 applyCommitPlan 事务
undoReviewUseCase(db): Promise<void>                  // 内部走 applyUndoPlan 事务
setStarred / setNote / resumeWord(db, wordId, …)
resetExamProgress(db, exam, dictionary, { excludeBasic }): Promise<void>  // 删卡+删日志→重建（单事务）

// queries（hooks，db 为 null 时内部短路返回 undefined）
useSettings(db) / useCardsForExam(db, exam) / useDueCards(db, exam, now)
useUserWordMeta(db, wordId) / useCoverage(db, exam, dictionary, scheduler, now, studyDay)
```

## 7. 会话状态机（StudySessionProvider + sessionReducer）

- `sessionReducer.ts` 是**纯 reducer**（SessionState / SessionAction / INITIAL_SESSION），可单测；
  Provider 只保留副作用。拆分原因是门禁 1（单文件 < 300 行）。
- phase：`idle → active → summary`；`error` 独立通道。
- `COMMIT_DONE` 同时写入 `studiedWordIds`（供 spreadSiblings 的当日已学过滤）。
- 提交走 `applyCommitPlan` 单事务（卡片 + 日志 + 撤销栈持久化）；撤销走 `applyUndoPlan`。
- 全流程测试：`src/app/StudySessionProvider.test.tsx`（5 用例，覆盖开始→预判→揭示→修正→提交→撤销→小结→空队列→错误态）。

## 8. UI 契约

- **令牌**：颜色/间距/圆角/动效一律 CSS 变量（`design-tokens.css` 是唯一原始色值处）；
  `--color-*`（tailwind 映射）与短名（`--bg/--fg/--accent…`）双套并存，短名解析到前者
- **图标**：只从 `ui/icons.ts` 导入 lucide 组件；尺寸 `ICON_SIZE = { inline: 16, button: 20, standalone: 24 }`，`ICON_STROKE = 1.75`
- **P0 红线**：禁 emoji；禁紫粉渐变；禁硬编码颜色（门禁 2/3 静态执行）
- **触摸**：交互元素 min-h-11（44px）；底部操作区适配 `env(safe-area-inset-bottom)`
- **合规文案**：权重一律「估计权重 N」（`format.ts weightLabel`）；例句标注 ADAPTED 来源
- **字体**：Inter（正文）+ JetBrains Mono（词头/音标/统计），自托管 latin woff2（`fonts.css`）；
  CJK 回落系统栈（PingFang SC / Microsoft YaHei / Noto）
- **a11y**：统一 `:focus-visible` 环；modal 焦点陷阱 + Esc；`prefers-reduced-motion` 全局熄火

## 9. PWA 与离线

| 项 | 值 |
| :-- | :-- |
| 注册策略 | `registerType: 'prompt'`，`main.tsx` 中 `registerSW({ immediate: true })` |
| 预缓存 | 20 条目（js/css/html/svg/png/**woff2**/webmanifest），`navigateFallback: 'index.html'` |
| manifest | `theme_color #0E7490`（accent）/ `background_color #F5F7FA`（画布）/ standalone / zh-CN |
| 图标 | any 192/512 + maskable 192/512（字形收进 60% 安全区）+ apple-touch-icon 180 |
| 品牌矢量源 | `public/favicon.svg`（32 视口：青底 + 三条递宽白条 + 圆点） |
| 图标再生成 | `python scripts/gen-pwa-icons.py`（Pillow；改品牌标先改 favicon.svg 与该脚本保持一致） |
| dev 模式 | SW 不启用（`devOptions.enabled: false`）；离线验证必须 `build + preview` |

## 10. 质量门禁（`npm run check`，当前 6/6）

| # | 脚本 | 规则 |
| :-- | :-- | :-- |
| 1 | check-file-length.mjs | 源文件有效行 < 300 |
| 2 | check-no-emoji.mjs | 全源码零 emoji |
| 3 | check-no-hardcoded-color.mjs | 颜色禁硬编码（原始色值仅 design-tokens.css 第 1 节） |
| 4 | check-icon-import.mjs | lucide 唯一出口 + ICON_SIZE 尺寸 |
| 5 | check-transaction-boundary.mjs | `db.transaction` 仅 `src/app/transactions.ts` |
| 6 | check-entry-size.mjs | `App.tsx`/`main.tsx` 有效行 < 100、禁业务关键字、禁 import storage |

测试契约：`vitest` + `jsdom`（Provider 测试用 `// @vitest-environment jsdom` 文件头），
`test.include` 必须同时覆盖 `.ts` 与 `.tsx`；存储层测试用 `fake-indexeddb/auto`。

## 11. 偏离登记（实现 vs 设计文档）

| # | 设计文档 | 实现 | 裁定 |
| :-- | :-- | :-- | :-- |
| D-1 | 02-ARCH §1.1：React 19.3.1 | React 18.3.1 | 维持 PRD §8.1 基线（02-ARCH §0.4） |
| D-2 | 02-ARCH §1.2：Tailwind 4 CSS-first | Tailwind 3.4.19 + PostCSS | 维持 PRD 基线；v4 升级列 P1 |
| D-3 | US-03 快捷键全集（→/Enter/R/F/Esc） | Space/1/2/3/C/Shift+C/X/Z/→/Enter/R/F | 已补齐（2026-10-21，OD-21）：→/Enter 与 Space 同一 handler；R/F 驱动背面折叠块；Esc 由弹窗自理；S=拼写 P1 剔除 |
| D-4 | US-05.2 形近词点击跳转 | ConfusableBlock 可点击 + WordPreviewModal 词条弹窗 | 已补齐（2026-10-21，OD-22）：不离开会话、不写 storage；弹窗打开时快捷键让位 |
| D-5 | US-08 同义替换 | `sense.synonymGroups[]` 义项级分组 + 五态候选 + `SynonymGroups` 区块 | 已交付（2026-10-22，**ADR-006** 取代 ADR-005）：同义主键改为 synset，词级 `Word.synonyms` 下线；覆盖 1574/1999 词、2034/2957 义项 |

## 12. 已知坑速查（踩过的，别再踩）

1. **Dexie 4.4.6 `bulkUpdate`**：单参 `[{ key, changes }]` 形式；两参调用直接类型错误。
2. **Dexie `between()`**：默认**排除上界**，到期查询要显式 `between(a, b, true, true)` 或 `<=`。
3. **ts-fsrs `Card` 类型**：包导出名是 `Card`（不是 `FsrsCard`）；Review 态卡必须
   `difficulty ∈ [1,10]` 且 `last_review` 非空，否则 `FSRSValidationError`。
4. **vitest include**：只写 `*.test.ts` 时 `.tsx` 测试静默不跑——曾导致 Provider 测试
   长期缺席。写 `src/**/*.test.{ts,tsx}`。
5. **`useLiveQuery` 依赖**：querier 闭包引用的对象必须稳定（ dictionary/scheduler 单例化）；
   db 为 null 的 hook 内部短路，不要在调用处加条件 hook。
6. **`PackDictionary.getWord`**：按数据包 ID 优先、回落 lemma。卡片的 `wordId` 是 `w_*` ID，
   只按 lemma 查会导致 `buildCardView` 全部返回 null、会话队列为空（生产级 bug，已修 + 回归测试）。
7. **规划公式与上限**：`n_new` 由 `ceil(N/(D-B))` 决定；考期远（spread 大）时上限
   `maxNewPerDay` 根本不绑定——测试「上限生效」必须把考期拉近到 spread ≤ N。
8. **Bash cwd 不跨调用保持**：npm 用 `npm --prefix <项目>`；tsc 用
   `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`（workspace 根无 node_modules，
   npx 会装到假包）。
9. **fake-indexeddb 对复合索引数组下界的 `between()` 恒返回空集**：`cards` 表的 `[exam+dueAt]`
   索引在 fake-indexeddb 下用 `between([exam, lo], [exam, hi])` 查到期卡会**静默返回空**
   （报 0 违反、0 失败，但 due 卡永远不出现）。`queries.useDueCards` 因此改用等值索引
   `where('exam').equals(exam).and(...)` + 内存过滤，注释与 Node 复验步骤见
   `src/app/queries.ts` useDueCards 上方。真实浏览器/Dexie 无此问题，别被单测全绿骗了。
