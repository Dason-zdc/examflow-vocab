# ExamFlow Vocab

按**真题义项考频**决定学什么、按**考试日期**决定什么时候复习的雅思背单词 PWA。
离线优先（IndexedDB + Service Worker 缓存），可选登录自建后端实现账号与多设备同步；无运行时 AI。

> 状态：M1 交付候选（IELTS 2000 词数据包 + 全量 P0 功能 + 201 项前端自动化测试 + 7 项后端集成冒烟 + E2E 冒烟 9/9 + 6 项架构门禁）
> 需求基线：`docs/01-PRD.md`（v0.3）｜设计记录：`docs/02-ARCHITECTURE.md`、`docs/03-UIUX.md`｜**实现契约：`docs/SPEC.md`**｜测试：`docs/04-TEST-PLAN.md`｜**后端与同步协议：`docs/API.md`**｜发布说明：`docs/RELEASE-NOTES.md`

---

## 1. 功能对照表（PRD 用户故事 → 交付状态）

| US | 用户故事 | 状态 | 交付说明 |
| :-- | :-- | :--: | :-- |
| US-01 | 学术常考词与义项优先 | **已交付** | 新卡按 `senseWeight` 降序入队（`sessionBuilder.buildSession`）；权重条 + 层级徽章 + 「估计权重」合规标注（`ui/format.ts weightLabel`）；熟词僻义独立成卡（`scheduler.buildCardsForWord`：主义项 + 僻义 + 每词 ≤3 张）；「排除基础词」开关切换后重算计划（`onboardingUseCase.activateExam`） |
| US-02 | 每日计划与考前可达性 | **已交付** | `n_new = min(M_new, ceil(N / max(1, D-B)))`（`planner.planDaily`）；过轮窗口 D≤B 停止引新卡；考期截断 `I_final = min(I_fsrs, max(1, D-1))`（`scheduler.ts`）；CANNOT_FINISH / BACKLOG / OVERRUN_WINDOW / EXAM_PAST 四类警告；首页覆盖率统计（`queries.useCoverage`：核心卡总数 / R≥0.9 数 / 今日新学 / 今日复习） |
| US-03 | 键盘完成一轮学习 | **已交付** | `Space / 1 / 2 / 3 / C / Shift+C / X / Z / → / Enter / R / F` 全键位（揭示·评分·发音·斩词·撤销·下一个·词根·形近词），输入框聚焦与弹窗打开时屏蔽（`ui/useStudyHotkeys.ts` + `HotkeyPanel`）；`→`/`Enter` 与 Space 同一 handler；R/F 驱动背面折叠块且仅在背面有副作用；Enter/Space 在可激活元素上让位原生激活，防双触发 |
| US-04 | 移动端单手完成学习 | **已交付** | 评分与「下一个」在底部操作区，触摸目标 ≥44px（`primitives` min-h-11 + `--touch-min`）；适配 `env(safe-area-inset-bottom)`；viewport 不禁用缩放；背面次要模块默认折叠 |
| US-05 | 形近词对比 | **已交付** | 展示：`lemma + 区分理由 + 要点`，默认折叠（`CardBack.tsx ConfusableBlock`）；点击形近词弹出词条摘要浮层（`WordPreviewModal`：音标 / 各义项 / 该考试估计权重条，查不到显示「词库未收录」；Esc 与点击遮罩关闭 + 焦点陷阱；弹窗打开时学习快捷键让位，不离开当前会话） |
| US-06 | 例句点词即查 | **已交付** | 背面例句逐词可点（`CardBack.SentenceText`）→ 词形还原 → 词条弹窗（`LookupModal`）；词库内词一键标星，词库外词创建自定义词条 + CUSTOM 卡进入新卡队列（`customWordsUseCase.addCustomWord`） |
| US-07 | 备份与恢复 | **已交付** | 单 JSON 导出 settings / cards / reviewLogs / userWordMeta / customWords（`storage/backupService.ts`，fsrs 日期字段序列化往返）；导入逐字段校验（`validateBackup`）；>7 天备份提醒（`BackupPanel`）；`navigator.storage.persist()` 调用 + iOS「请添加到主屏幕」引导 |
| US-08 | 同义替换可达性 | **未交付（数据阻塞，已裁定列 P1）** | 数据包 `synonyms` 字段 0/2000 填充；**ADR-005 裁定 M1 不做**：WordNet 义项对齐覆盖仅 61.6% 且约 20~30% 错配，US-08 标杆示例无法由同义集产出，P1 以独立 `etl_synonyms.py` + 抽检补齐（约 3 人日）。数据结构 `Word.synonyms` 已就绪，UI 契约「非空才渲染」约 30 行 |

---

## 1.1 原型与 PRD 对齐补充

| 能力 | 说明 | 入口 |
| :-- | :-- | :-- |
| 拼写练习（S-01） | 逐字母实时校验、Tab 提示、练习日志；不影响识记卡调度 | 快捷键 `S` / 背面「拼写」按钮 |
| 点词即查（S-02） | 背面例句逐词可点 → 词条弹窗；词库内标星，词库外建自定义词条并生成新卡 | 背面例句 |
| AI 私教（S-03） | 自备 OpenAI 兼容 Key（Base URL / Key / 模型名），助记 / 例句拆解 / 形近词对比 / 自由提问；未配置时不提供模拟回答 | 右栏「AI 私教」面板 |
| 学习仪表盘（S-04） | 核心覆盖率、考试日预测、积压、近 7 日复习量、未来 7 天到期 | 顶栏仪表盘按钮（桌面） |
| 入门水平测试（M-08） | 按权重分层抽样自评，认识的词标为已掌握，可在词库页恢复 | 仪表盘 → 入门水平测试 |
| 多词书可用性 | 只列出已发布数据包的考试，避免切过去才发现数据包缺失 | 顶栏考试选择 |
| 义项权重双 Tab | 「义项权重（估计）」与「英文释义」切换，覆盖该词全部义项，当前义项高亮 + 权重条 | 背面词典区 |
| 全量例句 + 朗读 | 语料例句（Tatoeba 英中句对，真实人工翻译），当前义项优先；每句可朗读、可点词、可溯源到句对编号 | 背面例句区 |
| 词根兜底 | 673 词有人工词根 + 233 词自动拆分（合计 45.3%）；其余展示词形变化，明确标注「自动拆分」不冒充人工词根 | 背面词根区（`R`） |
| 同义替换 | 数据包 v1.3.0：WordNet 同义集补全 1616/2000 词的近义词（每词最多 4 个，库内词带中文） | 背面形近/同义区（`F`） |
| 考点提炼 | 由义项权重/层级/熟词僻义对比推导考点提示，并保留「我的笔记」 | 背面考点与笔记区 |

> 数据包现状：仓库内只发布了 **IELTS 2000 词（v1.3.0）**。考研 / 六级 / 四六级包需要跑 `scripts/etl_build_pack.py`（当前脚本硬编码 IELTS），因此 UI 只展示已发布词书，不伪造其它考试数据。
> 合规口径：UI 统一使用「义项权重（估计）」，不出现「考频 / 出现次数」等表述（`npm test` 的 T-19 扫描会拦截）。

### 例句来源与署名（v1.3.0）

例句不再由句式模板套词生成，改为 **Tatoeba 英中句对**（真实人类撰写 + 人工翻译）：

- 覆盖：1445/2000 词共 2616 条语料例句；另有 300 词共 326 条人工撰写例句（Tier A），合计 2942 条、覆盖 87.3% 词条。
- 剩余 255 词在语料中没有可用句对，**保持无例句**并在义项上标 `sentencePending`，界面上明确提示「暂无可溯源的语料例句」。宁缺毋滥，不用模板句凑数。
- 筛选口径：词形精确匹配（`conservation` 不接受 `conservative`）、5–20 词、大小写与专有名词校验、姓名/低质内容黑名单、繁简转换（OpenCC）、译文长度比例 0.7–3.2 字/词。
- 义项对齐：用 ECDICT exchange 推断句中词形（原形/动词变位/名词复数/比较级）+ 中文关键词命中，贪心分配，每个义项最多 1 条。
- 许可：Tatoeba 数据为 **CC BY 2.0 FR**。界面在每条句子旁给出可点击的句对编号（`#306376` → tatoeba.org），背面例句区底部有统一署名。
- 复现：`python scripts/fetch_tatoeba.py` → `python scripts/enrich_pack_sentences.py`；`scripts/build/sentence-picks.json` 记录了每个词的选句，`etl_build_pack.py` 全量重建时也会复用它。

---

## 2. 快速开始

环境：Node >= 22.5（后端使用内置 `node:sqlite`；前端本身兼容 20.19+）。

```bash
npm install            # 依赖安装
npm run dev:full       # 一键起前后端：前端 5173 + 后端 8787（/api 由 Vite 代理）
npm run build          # 生产构建 → dist/（含 Service Worker 与预缓存清单）
npm run serve          # 构建并单端口启动（前端 + API 同源，默认 http://localhost:8787）
npm test               # 198 项前端测试（vitest）
npm run test:api       # 7 项后端集成冒烟（自起服务 + 临时 SQLite）
npm run check          # 6 项架构门禁
npm run typecheck      # tsc --noEmit
```

只想跑前端（纯离线模式）：`npm run dev`。只想跑后端：`npm run dev:api`。

**首次使用**：打开 http://localhost:5173 → 设置考试日期 → 开始学习。
**开启云同步**：右上角设置 → 「云同步」→ 注册 / 登录（账号写在本地 SQLite）。之后每 30 秒自动同步，换设备登录同一账号即可恢复进度。

离线验证：`npm run build && npm run serve` 后，DevTools → Application → Service Workers
应看到一个已激活 SW，且 Cache Storage 预缓存 **20 个条目**（含 2 个 woff2 字体与 5 个图标）。

### 2.1 后端与云同步（新增）

- 后端：`server/`，Node 内置 `node:http` + `node:sqlite`，**零第三方依赖**，无需 Docker / 外部数据库
- 数据库：`server/data/examflow.db`（首次启动自动建表并播种已发布数据包元数据）
- 同步模型：离线优先 + 双向对账。本地 IndexedDB 是主副本，后端只做多设备汇聚
- 冲突策略：逐行 LWW（客户端时钟版本），删除用软删墓碑，派生卡不参与推送
- 完整协议、报文格式、表结构见 **`docs/API.md`**

```bash
curl http://localhost:8787/api/v1/health
curl -X POST http://localhost:8787/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"password123"}'
```

## 3. 命令与脚本

| 命令 | 说明 |
| :-- | :-- |
| `npm run dev:full` | 同时起前端（5173）与后端（8787），`/api` 走 Vite 代理 |
| `npm run dev:api` | 只起后端，`--watch` 热重启 |
| `npm run serve` | 生产：构建 + 单端口启动（静态 `dist/` + API） |
| `npm test` | vitest 全量（33 个文件 / 201 用例，`.ts` 与 `.tsx` 均收集） |
| `npm run test:api` | 后端集成冒烟（7 项，node:test，自起服务 + 临时 SQLite） |
| `npm run check` | 6 项门禁：文件行数 / emoji / 硬编码颜色 / 图标唯一出口 / Dexie 事务边界 / 入口只装配 |
| `npm run typecheck` | TypeScript 严格模式全量检查 |
| `npm run build` | vite build + vite-plugin-pwa（generateSW） |
| `python scripts/gen-pwa-icons.py` | 重新栅格化 PWA 图标（需 Pillow；品牌矢量源在 `public/favicon.svg`） |
| `python scripts/etl_build_pack.py` | 重建 IELTS 数据包（会覆盖 `docs/DATA-QUALITY.md`） |
| `python scripts/etl_build_pack.py --verify-only` | 对已发布数据包跑交付校验（sha256 / ID 唯一性 / 例句覆盖 / examStats Schema） |
| `node scripts/enrich_pack_synonyms.mjs` | 用 WordNet 同义集补/刷新数据包 synonyms（需先 `npm i -D wordnet-db`），自动重算分块 sha256 与版本 |
| `python scripts/fetch_tatoeba.py` | 下载 Tatoeba 英中句对语料（约 26 MB，构建期缓存到 `scripts/.cache/`，不入库） |
| `python scripts/enrich_pack_sentences.py` | 用语料例句替换模板例句并按义项对齐（`--dry` 只看覆盖率与抽样），重算 sha256 与版本 |
| `python scripts/e2e/smoke.py` | E2E 冒烟 9 断言（自包含启停 vite preview + Playwright Chromium；报告落 `dist-e2e/`，需 managed venv 的 python） |

## 4. 架构导览

三层纪律：**domain 纯函数**（不碰 DOM / 时钟可注入）→ **app 唯一事务边界**（`db.transaction`
只允许出现在 `src/app/transactions.ts`，门禁 5 静态检查）→ **ui 只渲染**（不直接写 Dexie，
一律走 app 用例；持久数据经 `dexie-react-hooks` 的 `useLiveQuery`）。

```
src/
├── domain/     纯领域层：types / clock / planner / scheduler / sessionQueue / reviewCommitter
├── content/    数据包层：packVerifier（校验）/ packLoader（分块加载）/ dictionary / packCache
│               customWord（生词→词条）/ morphology（词缀自动拆分兜底）
├── storage/    Dexie 4.4.6：db（表结构，含同步表）/ backupService（导入导出序列化）
├── app/        用例层：onboardingUseCase / sessionBuilder / reviewUseCase / userWordsUseCase
│               customWordsUseCase（点词生词建卡）/ spellingUseCase（练习日志）
│               tutor（AI 私教请求与提示词）/ dashboard（仪表盘指标）/ placement（入门测试抽样）
│               examTip（考点提炼，由权重/僻义对比推导）
│               queries（useLiveQuery hooks）/ transactions（唯一事务出口，含 pull 合并）
│               sync/（apiClient / wire 编解码 / syncEngine / useSync）
│               StudySessionProvider + sessionReducer（会话状态机）
└── ui/         表现层：ExamFlowApp（容器）/ AppHeader / StudyView / CardFront / CardBack
                CardBackDictionary（义项/英文释义双 Tab）/ CardBackSentences（全量例句+朗读）
                CardBackBlocks（词根/形近同义/考点笔记）/ SentenceTokens（点词即查分词）
                SpellingModal / LookupModal / AiTutorPanel / DashboardModal / PlacementTestModal
                ModalShell / StudySidebar / MobileActionBar / DashboardContainer
                DailyPlanPanel / VocabBookView / SettingsModal / SyncSettingsPanel / BackupPanel
                primitives / icons（lucide 唯一出口）/ format / speech / useStudyHotkeys

server/         后端（零依赖）：config / db（SQLite schema + 同步序号）/ auth（scrypt + HMAC 令牌）
                sync（LWW push/pull）/ routes / server（http 分发 + 静态托管）/ smoke-test
```

双层调度：**宏观** ts-fsrs 5.4.2 排间隔 + 考期截断；**微观** 日内重现队列
（`sessionQueue` 积分制，同卡本轮 ≥2 次通关才移出；同词当日只出 1 张，`planner.spreadSiblings`）。

完整契约（钉死的版本、接口签名、数据契约、已知坑）见 **`docs/SPEC.md`**。

## 5. 数据与合规

- 数据包：`public/packs/IELTS/` v1.3.0（7 个分块 + lemma-map + manifest，2000 词 / 4150 义项；语料例句 1445 词 / 2616 条（另 300 词共 326 条人工撰写），同义词 1616 词）
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

### 8.1 完整版（推荐：前端 + 后端 + 同步）

单机 Node 服务，前后端同源，无需额外数据库进程：

```bash
npm ci
npm run build
EXAMFLOW_SECRET='<换成随机长字符串>' PORT=8787 npm start
# 打开 http://localhost:8787
```

- 数据文件：`server/data/examflow.db`（定期备份该文件即可；WAL 模式下同时复制 `-wal`/`-shm` 或先停服）
- **必须覆盖 `EXAMFLOW_SECRET`**，否则令牌签名使用内置开发密钥
- 反向代理（Nginx 等）只需转发到 8787；SPA 回退由后端处理
- 当前为单实例 SQLite，多实例横向扩展需替换为共享数据库

### 8.2 纯静态（仅离线模式，无账号/同步）

`npm run build` 后 `dist/` 可放到任何静态托管（GitHub Pages / Netlify / Vercel / OSS + CDN）。
注意：
- `dist/` 需按原样部署（`sw.js`、`manifest.webmanifest`、`packs/`、`fonts/`、图标必须在根路径）
- Service Worker 的 `start_url` 为 `/`，**不要**部署到子路径（否则需改 `vite.config.ts` 的 `base`）
- PWA 注册策略为 `autoUpdate`（`registerType: 'autoUpdate'`）：新版本就绪后自动接管并刷新，避免停留在旧包
- 字体已自托管（`public/fonts/*.woff2`，latin 子集，共约 80 KB），无运行时 CDN 请求
- 静态部署时 `/api/*` 不可用，设置面板里的云同步会提示网络错误，其余功能完全可用

## 9. 文档索引

| 文档 | 内容 |
| :-- | :-- |
| `docs/01-PRD.md` | 产品需求 v0.3（唯一需求基线） |
| `docs/02-ARCHITECTURE.md` | 技术架构设计记录（含 §0.4 偏离裁定） |
| `docs/03-UIUX.md` | 交互与视觉规范 |
| `docs/SPEC.md` | **实现契约**：版本钉死 / 分层规则 / 文件地图 / 接口 / 数据契约 / 偏离登记 |
| `docs/04-TEST-PLAN.md` | 测试计划：158 项用例清单 / AC 覆盖矩阵 / T-19 合规扫描 / E2E 冒烟 / 手工验收矩阵 |
| `docs/API.md` | **后端 API 与同步协议**：端点 / 认证 / 报文 / LWW 规则 / 表结构 / 安全限制 |
| `docs/RELEASE-NOTES.md` | 发布说明：交付范围 / 质量证据 / P0-1 事件记录 / 已知缺口声明 / P1 路线 |
| `docs/DATA-QUALITY.md` | 数据包质量自检（ETL 自动生成） |
| `docs/decisions/` | ADR-001~005 与 OPEN-DECISIONS（ADR-005：US-08 同义词数据 M1 不做，列 P1） |
