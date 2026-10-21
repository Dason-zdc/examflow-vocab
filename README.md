# ExamFlow Vocab

按**真题义项考频**决定学什么、按**考试日期**决定什么时候复习的雅思背单词 PWA。
纯静态、离线可用、无后端、无运行时 AI。

> 状态：M1 交付候选（IELTS 2000 词数据包 + 全量 P0 功能 + 158 项自动化测试 + E2E 冒烟 9/9 + 6 项架构门禁）
> 需求基线：`docs/01-PRD.md`（v0.3）｜设计记录：`docs/02-ARCHITECTURE.md`、`docs/03-UIUX.md`｜**实现契约：`docs/SPEC.md`**｜测试：`docs/04-TEST-PLAN.md`｜**发布说明：`docs/RELEASE-NOTES.md`**

---

## 1. 功能对照表（PRD 用户故事 → 交付状态）

| US | 用户故事 | 状态 | 交付说明 |
| :-- | :-- | :--: | :-- |
| US-01 | 学术常考词与义项优先 | **已交付** | 新卡按 `senseWeight` 降序入队（`sessionBuilder.buildSession`）；权重条 + 层级徽章 + 「估计权重」合规标注（`ui/format.ts weightLabel`）；熟词僻义独立成卡（`scheduler.buildCardsForWord`：主义项 + 僻义 + 每词 ≤3 张）；「排除基础词」开关切换后重算计划（`onboardingUseCase.activateExam`） |
| US-02 | 每日计划与考前可达性 | **已交付** | `n_new = min(M_new, ceil(N / max(1, D-B)))`（`planner.planDaily`）；过轮窗口 D≤B 停止引新卡；考期截断 `I_final = min(I_fsrs, max(1, D-1))`（`scheduler.ts`）；CANNOT_FINISH / BACKLOG / OVERRUN_WINDOW / EXAM_PAST 四类警告；首页覆盖率统计（`queries.useCoverage`：核心卡总数 / R≥0.9 数 / 今日新学 / 今日复习） |
| US-03 | 键盘完成一轮学习 | **已交付** | `Space / 1 / 2 / 3 / C / Shift+C / X / Z / → / Enter / R / F` 全键位（揭示·评分·发音·斩词·撤销·下一个·词根·形近词），输入框聚焦与弹窗打开时屏蔽（`ui/useStudyHotkeys.ts` + `HotkeyPanel`）；`→`/`Enter` 与 Space 同一 handler；R/F 驱动背面折叠块且仅在背面有副作用；Enter/Space 在可激活元素上让位原生激活，防双触发 |
| US-04 | 移动端单手完成学习 | **已交付** | 评分与「下一个」在底部操作区，触摸目标 ≥44px（`primitives` min-h-11 + `--touch-min`）；适配 `env(safe-area-inset-bottom)`；viewport 不禁用缩放；背面次要模块默认折叠 |
| US-05 | 形近词对比 | **已交付** | 展示：`lemma + 区分理由 + 要点`，默认折叠（`CardBack.tsx ConfusableBlock`）；点击形近词弹出词条摘要浮层（`WordPreviewModal`：音标 / 各义项 / 该考试估计权重条，查不到显示「词库未收录」；Esc 与点击遮罩关闭 + 焦点陷阱；弹窗打开时学习快捷键让位，不离开当前会话） |
| US-06 | 例句点词即查 | **不做（P1）** | PRD 明确 MVP 不承诺；例句词不可点击、无可点击样式 |
| US-07 | 备份与恢复 | **已交付** | 单 JSON 导出 settings / cards / reviewLogs / userWordMeta / customWords（`storage/backupService.ts`，fsrs 日期字段序列化往返）；导入逐字段校验（`validateBackup`）；>7 天备份提醒（`BackupPanel`）；`navigator.storage.persist()` 调用 + iOS「请添加到主屏幕」引导 |
| US-08 | 同义替换可达性 | **未交付（数据阻塞，已裁定列 P1）** | 数据包 `synonyms` 字段 0/2000 填充；**ADR-005 裁定 M1 不做**：WordNet 义项对齐覆盖仅 61.6% 且约 20~30% 错配，US-08 标杆示例无法由同义集产出，P1 以独立 `etl_synonyms.py` + 抽检补齐（约 3 人日）。数据结构 `Word.synonyms` 已就绪，UI 契约「非空才渲染」约 30 行 |

---

## 2. 快速开始

```bash
npm install          # 依赖安装（Node >= 20.19）
npm run dev          # 开发服务器（PWA 在 dev 下不启用，与 vite.config devOptions 一致）
npm run build        # 生产构建 → dist/（含 Service Worker 与预缓存清单）
npm run preview      # 本地预览生产构建（验证 PWA 请用此模式）
npm test             # 158 项自动化测试（vitest）
npm run check        # 6 项架构门禁
npm run typecheck    # tsc --noEmit
```

离线验证：`npm run build && npm run preview` 后，DevTools → Application → Service Workers
应看到一个已激活 SW，且 Cache Storage 预缓存 **20 个条目**（含 2 个 woff2 字体与 5 个图标）。

## 3. 命令与脚本

| 命令 | 说明 |
| :-- | :-- |
| `npm test` | vitest 全量（19 个文件 / 158 用例，`.ts` 与 `.tsx` 均收集） |
| `npm run check` | 6 项门禁：文件行数 / emoji / 硬编码颜色 / 图标唯一出口 / Dexie 事务边界 / 入口只装配 |
| `npm run typecheck` | TypeScript 严格模式全量检查 |
| `npm run build` | vite build + vite-plugin-pwa（generateSW） |
| `python scripts/gen-pwa-icons.py` | 重新栅格化 PWA 图标（需 Pillow；品牌矢量源在 `public/favicon.svg`） |
| `python scripts/etl_build_pack.py` | 重建 IELTS 数据包（会覆盖 `docs/DATA-QUALITY.md`） |
| `python scripts/etl_build_pack.py --verify-only` | 对已发布数据包跑交付校验（sha256 / ID 唯一性 / 例句覆盖 / examStats Schema） |
| `python scripts/e2e/smoke.py` | E2E 冒烟 9 断言（自包含启停 vite preview + Playwright Chromium；报告落 `dist-e2e/`，需 managed venv 的 python） |

## 4. 架构导览

三层纪律：**domain 纯函数**（不碰 DOM / 时钟可注入）→ **app 唯一事务边界**（`db.transaction`
只允许出现在 `src/app/transactions.ts`，门禁 5 静态检查）→ **ui 只渲染**（不直接写 Dexie，
一律走 app 用例；持久数据经 `dexie-react-hooks` 的 `useLiveQuery`）。

```
src/
├── domain/     纯领域层：types / clock / planner / scheduler / sessionQueue / reviewCommitter
├── content/    数据包层：packVerifier（校验）/ packLoader（分块加载）/ dictionary / packCache
├── storage/    Dexie 4.4.6：db（表结构）/ backupService（导入导出序列化）
├── app/        用例层：onboardingUseCase / sessionBuilder / reviewUseCase / userWordsUseCase
│               queries（useLiveQuery hooks）/ transactions（唯一事务出口）
│               StudySessionProvider + sessionReducer（会话状态机）
└── ui/         表现层：ExamFlowApp（容器）/ AppHeader / StudyView / CardFront / CardBack
                DailyPlanPanel / VocabBookView / SettingsModal / BackupPanel / HotkeyPanel
                primitives / icons（lucide 唯一出口）/ format / speech / useStudyHotkeys
```

双层调度：**宏观** ts-fsrs 5.4.2 排间隔 + 考期截断；**微观** 日内重现队列
（`sessionQueue` 积分制，同卡本轮 ≥2 次通关才移出；同词当日只出 1 张，`planner.spreadSiblings`）。

完整契约（钉死的版本、接口签名、数据契约、已知坑）见 **`docs/SPEC.md`**。

## 5. 数据与合规

- 数据包：`public/packs/IELTS/`（7 个分块 + lemma-map + manifest，3.65 MB，2000 词 / 4150 义项）
- 来源：ECDICT（MIT）词条与变形、WordNet 英释、AWL 570 学术词族、Oxford 3000/5000
  词表成员判定、WordNet sense 频次——合成为 `senseWeight`
- **合规红线（PRD §12.4）**：`kind` 恒为 `ESTIMATED`，UI 一律标注「估计权重」；
  **禁止**任何「真题考频 / 历年出现次数」表述；门禁 `check-no-emoji` 之外的 T-19
  禁用词扫描由测试计划 `docs/04-TEST-PLAN.md` §5 落地
- 质量报告：`docs/DATA-QUALITY.md`（ETL 自动生成，重新构建数据包时覆盖）

## 6. 质量门禁（`npm run check`，6/6 通过）

| # | 门禁 | 规则 |
| :-- | :-- | :-- |
| 1 | 单文件行数 | 有效行 < 300（`src/app/sessionReducer.ts` 即为此从 Provider 拆出） |
| 2 | 禁止 emoji | 全源码零 emoji |
| 3 | 禁止硬编码颜色 | 颜色一律走 CSS 变量（`src/styles/design-tokens.css` 是唯一原始色值处） |
| 4 | 图标唯一出口 | lucide 图标只能从 `src/ui/icons.ts` 导入，尺寸走 `ICON_SIZE` 三档 |
| 5 | Dexie 事务边界 | `db.transaction` 只允许在 `src/app/transactions.ts` |
| 6 | 入口只装配 | `src/App.tsx` / `src/main.tsx` 有效行 < 100，禁业务关键字，禁直接 import storage |

## 7. 已知缺口（交付声明）

| # | 缺口 | 影响 | 收口路径 |
| :-- | :-- | :-- | :-- |
| G-3 | US-08 `synonyms` 数据 0/2000（OD-23 → ADR-005：M1 不做，列 P1） | 同义替换功能完全不可见 | P1：独立 `scripts/etl_synonyms.py`（WordNet 同义集 + enDef 义项对齐 + 黑名单 + 抽检 100 词），再补 CardBack「非空才渲染」区块；不得并入 `etl_build_pack.py`（1401 行已豁免） |

已闭环（留档）：**G-1**（US-03 缺 `→ / Enter / R / F` 四键）与 **G-2**（US-05.2 形近词不可点击跳转）已于 2026-10-21 交付（OD-21 / OD-22 关闭，SPEC §11 D-3 / D-4 同步）；**G-4** 架构文档偏差裁定见 `02-ARCHITECTURE.md §0.4`（React 19 / Tailwind 4 升级列 P1）。

## 8. 部署

纯静态产物，任何静态托管均可（GitHub Pages / Netlify / Vercel / OSS + CDN）：

```bash
npm run build   # 产物在 dist/
```

注意事项：
- `dist/` 需按原样部署（`sw.js`、`manifest.webmanifest`、`packs/`、`fonts/`、图标必须在根路径）
- Service Worker 的 `start_url` 为 `/`，**不要**部署到子路径（否则需改 `vite.config.ts` 的 `base`）
- PWA 注册策略为 `prompt`（`registerType: 'prompt'`），新版本就绪后由用户确认刷新
- 字体已自托管（`public/fonts/*.woff2`，latin 子集，共约 80 KB），无运行时 CDN 请求

## 9. 文档索引

| 文档 | 内容 |
| :-- | :-- |
| `docs/01-PRD.md` | 产品需求 v0.3（唯一需求基线） |
| `docs/02-ARCHITECTURE.md` | 技术架构设计记录（含 §0.4 偏离裁定） |
| `docs/03-UIUX.md` | 交互与视觉规范 |
| `docs/SPEC.md` | **实现契约**：版本钉死 / 分层规则 / 文件地图 / 接口 / 数据契约 / 偏离登记 |
| `docs/04-TEST-PLAN.md` | 测试计划：158 项用例清单 / AC 覆盖矩阵 / T-19 合规扫描 / E2E 冒烟 / 手工验收矩阵 |
| `docs/RELEASE-NOTES.md` | 发布说明：交付范围 / 质量证据 / P0-1 事件记录 / 已知缺口声明 / P1 路线 |
| `docs/DATA-QUALITY.md` | 数据包质量自检（ETL 自动生成） |
| `docs/decisions/` | ADR-001~005 与 OPEN-DECISIONS（ADR-005：US-08 同义词数据 M1 不做，列 P1） |
