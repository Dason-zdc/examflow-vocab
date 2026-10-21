# ExamFlow Vocab — 技术架构 Spec v1.0

> 角色：高见远（首席架构师）
> 日期：2026-10-21
> 状态：已定稿，待 team-lead 确认两处偏离（见 §0.2）
> 上游基线：`0_2_prd.md`（PRD v0.2，唯一需求基线）
> 逻辑参考：`examflow_vocab.html`（交互演示原型，仅作逻辑参考，非交付实现、非指标依据）
> 本文是**契约**：点名文件与接口、钉死版本、内嵌已知坑、以端到端验证步骤收尾。实现与本文冲突时，**先改本文再改代码**。

---

## 0. 摘要

### 0.1 一句话架构

纯静态 PWA，`Vite 8 + React 19 + TypeScript 7 + Tailwind 4` 构建；领域层（`planner / scheduler / sessionQueue / reviewCommitter`）为**纯 TypeScript、不碰 DOM、时钟可注入**；`ts-fsrs 5.4.2` 精确锁版本做跨天调度，考期截断由**我们自己的夹取函数**落地（实测 ts-fsrs 的 `maximum_interval` 不可依赖，见 §11.1）；`Dexie 4.4.6` 存用户数据，`vite-plugin-pwa` 提供离线壳。MVP 无后端、无 AI。

### 0.2 两处对上游的偏离（需 team-lead 确认）

| # | 上游写法 | 本 Spec 结论 | 理由 | 回滚成本 |
| :-- | :-- | :-- | :-- | :-- |
| D-1 | PRD §8.1 与任务书写 "React 18" | **React 19.3.1** | registry 实测 latest 为 19.3.1，18.x 已进入维护态；`lucide-react 1.60.0` / `dexie-react-hooks 4.4.0` 均支持 19；本项目不依赖任何 18-only API | 仅改 `package.json` 4 行（react/react-dom/@types/react/@types/react-dom），无代码影响 |
| D-2 | PRD §1.2 写 "iOS Safari 16+" | **浏览器下限上调为 Safari 16.4 / Chrome 111 / Firefox 128** | Tailwind CSS v4 依赖 `@property` 与 `color-mix()`，官方明确不支持更低版本 | 若必须守 16.0，改用 `tailwindcss 3.4.19` + PostCSS 插件，需重写 `theme.css` 的令牌定义方式 |

其余选型均在 PRD §8.1 给定范围内，未越界。

### 0.3 首发考试

team-lead 任务书定为 **IELTS**（2000 词级数据包，ECDICT + WordNet + Oxford 3000/5000 + AWL）。PRD §12 的 Q-01（首发考试：考研 or IELTS）**按 IELTS 收敛**。`ExamCode` 枚举保留全部取值，MVP 只发布 `IELTS` 一个包。

---

### 0.4 偏离裁定（2026-10-21，team-lead）

§0.2 的两处偏离经 team-lead 裁定，**维持 PRD §8.1 基线，不回填本文 1.1/1.2 的选定行**。实现以 PRD 基线落地，本文选型矩阵保留为设计记录；**实现契约以 `docs/SPEC.md` 为准**。

| # | 本文选定（§1.1/§1.2） | 实际落地 | 裁定理由 |
| :-- | :-- | :-- | :-- |
| D-1 | React 19.3.1 | **React 18.3.1** | PRD §8.1 原文即 React 18；实现期未发现任何需要 19 的能力；18 进入维护态但不影响本 MVP 生命周期。升级 19 无代码收益，列为 P1 选项 |
| D-2 | Tailwind 4.3.3（CSS-first） | **Tailwind 3.4.19 + PostCSS** | v4 的浏览器下限上调（Safari 16.4）对目标用户（含旧 iOS）是真实成本；v3 的 `tailwind.config.ts` + CSS 变量双层令牌同样满足 P0-4 禁硬编码，且已被 6 项门禁静态验证。升级 v4 需重写令牌定义方式，列为 P1 选项 |

> 此裁定同步写入 `docs/SPEC.md` §1（版本钉死）与 §12（偏离登记）。

---

## 1. 技术选型对比矩阵

评分口径：5 分制，分数越高越好。权重按 MVP 原则：**学习成本 / 生态成熟度 / 部署成本 高权重，扩展性 低权重**。

### 1.1 前端框架与构建

| 方案 | MVP 速度 | 生态成熟度 | 部署成本 | 离线/PWA | 结论 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **Vite 8.3.4 + React 19.3.1（SPA）** | 5 | 5 | 5（纯静态） | 5 | **选定** |
| Next.js（App Router） | 4 | 5 | 3（需 Node 运行时或 export 模式） | 3 | 否决：MVP 无 SSR 需求，引入 RSC 心智负担，且 offline 需额外处理 |
| Vue 3 + Vite | 5 | 4 | 5 | 5 | 否决：PRD §8.1 已定 React；换栈无收益 |
| Taro 3 / uni-app | 4 | 4 | 4 | 3 | 否决：目标是 Web PWA，非小程序 |

**理由**：纯静态产物 + 完全离线是硬需求（PRD §2.3 离线可用 100%），SPA 是最短路径；Vite 8 的构建产物为版本化 hash 静态资源，与 Workbox 预缓存天然契合。

### 1.2 样式方案

| 方案 | 构建期编译 | 令牌化能力 | 浏览器下限 | 结论 |
| :-- | :-- | :-- | :-- | :-- |
| **Tailwind CSS 4.3.3 + `@tailwindcss/vite`** | 是 | 5（CSS-first `@theme`） | Safari 16.4 / Chrome 111 | **选定** |
| Tailwind CSS 3.4.19（v3-lts）+ PostCSS | 是 | 3（`tailwind.config.js`） | Safari 12+ | 备选（见 D-2） |
| CSS Modules + 手写 design tokens | 是 | 4 | 无下限 | 否决：MVP 期写样式成本高 |
| UnoCSS | 是 | 4 | 取决于 preset | 否决：团队熟悉度低于 Tailwind |

**理由**：Tailwind v4 的 `@theme` 是**在 CSS 里定义语义令牌**，正好落地 P0「禁止硬编码颜色」，且能被静态检查（§10.3）。代价是浏览器下限上调（D-2）。

### 1.3 状态管理

| 方案 | 心智负担 | 与 Dexie 的一致性 | 结论 |
| :-- | :-- | :-- | :-- |
| **Context + `useReducer`（会话状态机）+ `dexie-react-hooks` 的 `useLiveQuery`（持久数据）** | 4 | 5（单一真相源 = IndexedDB） | **选定** |
| Zustand 5.0.15 | 5 | 2（易形成 Dexie / store 双真相源） | 否决 |
| Redux Toolkit | 2 | 2 | 否决：样板代码过重 |
| Jotai | 4 | 2 | 否决：同上双源风险 |

**理由**：本项目只有一个复杂状态机（学习会话：卡片阶段 / 评分 / 队列 / 撤销栈），`useReducer` 足够；其余状态全部是 IndexedDB 的投影。引入全局 store 只会制造"内存态 vs 持久化态"不一致的隐患。

### 1.4 调度算法

| 方案 | 成熟度 | 自研成本（分高 = 成本越低） | 考期可塑性 | 结论 |
| :-- | :-- | :-- | :-- | :-- |
| **ts-fsrs 5.4.2（精确锁版本）** | 5 | 5（零自研） | 4（`maximum_interval` / `request_retention` 可动态注入） | **选定** |
| 自研 FSRS-4.5 公式（原型内联版） | 2 | 1 | 5 | 否决：PRD §5.5 明确"不自研公式"；原型仅为演示 |
| Anki SM-2 | 4 | 3 | 2 | 否决：无 stability / difficulty 模型，无法算北极星指标所需 R |
| 自研 Leitner 盒 | 2 | 4 | 1 | 否决：同上 |

**理由**：PRD 北极星指标（考试日 R ≥ 0.9）依赖 FSRS 的 stability 模型，必须用它。

### 1.5 本地存储

| 方案 | 事务 | 容量 | 索引 | 结论 |
| :-- | :-- | :-- | :-- | :-- |
| **IndexedDB + Dexie 4.4.6** | 5 | 5（GB 级） | 5 | **选定** |
| `idb`（薄封装原生 API） | 3 | 5 | 3 | 否决：事务与查询需手写，成本高 |
| 裸 IndexedDB API | 1 | 5 | 2 | 否决 |
| localStorage | 无事务 | 1（5MB） | 无 | 否决：装不下 2000 词数据包 + 复习日志 |

### 1.6 PWA / 离线

| 方案 | 配置成本 | 更新可控性 | 结论 |
| :-- | :-- | :-- | :-- |
| **vite-plugin-pwa 2.0.0（Workbox 7.4.1）** | 5 | 5（prompt 模式） | **选定** |
| 手写 Service Worker | 1 | 2 | 否决：预缓存清单需自己维护 hash |
| 仅 Cache API，不用 SW | 4 | 1（无法离线导航） | 否决：不满足"首次加载后断网可用" |

### 1.7 测试

| 方案 | 单元（纯 TS 领域层） | IndexedDB 集成 | E2E | 结论 |
| :-- | :-- | :-- | :-- | :-- |
| **Vitest 5.0.5 + fake-indexeddb 6.2.6 + Playwright 1.64.1** | 5 | 5 | 5 | **选定** |
| Jest + fake-indexeddb | 3 | 4 | — | 否决：与 Vite 8 需额外转译层 |
| Node 内置 test runner | 3 | 2 | — | 否决：无 jsdom/fake-indexeddb 生态整合 |
| Vitest + happy-dom | 5 | 5 | — | 否决集成层：`happy-dom` 对 `<dialog>` 与焦点行为覆盖不足，E2E 另用 Playwright |

### 1.8 图标库（P0 硬约束）

| 方案 | 图标量 | React 适配 | Tree-shaking | 结论 |
| :-- | :-- | :-- | :-- | :-- |
| **lucide-react 1.60.0** | 4334（实测 `dist/esm/icons` 计数） | 官方 React 包，peer `react ^16.5.1 \|\| ^17 \|\| ^18 \|\| ^19` | `sideEffects: false` | **选定** |
| heroicons | ~300 | React 包 | 好 | 否决：图标量不足，学习类图标（书签/发音/斩词）缺失 |
| @radix-ui/react-icons | ~300 | React 包 | 好 | 否决：同上 |
| 自维护内联 SVG | — | — | — | 否决：MVP 期维护成本高，且易与第三方混用 |

**核验记录**（实测，非记忆）：
```
npm view lucide-react version                 -> 1.60.0
npm view lucide-react@1.60.0 peerDependencies -> { react: '^16.5.1 || ^17.0.0 || ^18.0.0 || ^19.0.0', '@types/react': '*' }
npm view lucide-react@1.60.0 --json           -> main: dist/cjs/lucide-react.js
                                                 module: dist/esm/lucide-react.mjs
                                                 typings: dist/lucide-react.d.ts
                                                 sideEffects: false
                                                 exports: (无)
node -e "require('lucide-react')"             -> 具名导出 6494 个，Check/X/Undo2/Star/Volume2/BookOpen 等均存在
```

### 1.9 日期与时间

| 方案 | 体积 | 需求贴合度 | 结论 |
| :-- | :-- | :-- | :-- |
| **自研 `src/domain/day.ts`（约 60 行）** | 0 | 5（只需"日切 04:00 学习日键"与"距考天数"） | **选定** |
| date-fns | ~20KB（按需） | 4 | 否决：无时区转换需求，引入会诱导误用 |
| dayjs + 插件 | ~7KB | 4 | 否决：同上 |
| Luxon | ~70KB | 5 | 否决：过重 |

**理由**：全部计算在**本地时区**、不做跨时区转换（PRD §6 考试日期存本地日期字符串）。自研能精确控制"学习日键 = 本地日期减 dayStartHour"这条特殊规则。

### 1.10 运行时数据校验

| 方案 | 体积 | 结论 |
| :-- | :-- | :-- |
| **手写 `content/packVerifier.ts`（约 60 行）** | 0 | **选定**：数据包由我方 CDN 发布且已过 sha256 完整性校验，只需形状断言 |
| Zod 4.6.7 | ~14KB | 否决：MVP 无外部不可信输入面；sha256 + 版本号已覆盖完整性 |

### 1.11 未引入（显式排除）

`zustand`、`zod`、`tailwind-merge 3.7.0`、`redux`、`date-fns`、`dayjs`、`happy-dom 21.0.3`、`@testing-library/jest-dom 7.0.1`、任何 UI 组件库（Radix / MUI / shadcn）。弹窗用原生 `<dialog>`（自带焦点循环与 Esc），不引组件库。

---

## 2. 版本锚定表

所有版本号**均由本机 npm 实测得出，非记忆**。验证命令（Node 22.22.2）：

```bash
export PATH="C:/Users/dason/.workbuddy/binaries/node/versions/22.22.2-6:$PATH"
npm view <pkg> version            # 查 latest
npm view <pkg> dist-tags          # 查发布通道
npm view <pkg>@<ver> peerDependencies
```

### 2.1 运行时依赖（`dependencies`）

| 包 | 版本 | 写法 | 验证命令 | 备注 |
| :-- | :-- | :-- | :-- | :-- |
| react | 19.3.1 | `^19.3.1` | `npm view react version` | 见 D-1 |
| react-dom | 19.3.1 | `^19.3.1` | `npm view react-dom version` | |
| ts-fsrs | **5.4.2** | **`5.4.2`（精确，无 `^`）** | `npm view ts-fsrs version` | 见 §11.3；6.0.0-beta 已发布 |
| dexie | 4.4.6 | `^4.4.6` | `npm view dexie version` | |
| dexie-react-hooks | 4.4.0 | `^4.4.0` | `npm view dexie-react-hooks version` | peer: `dexie >=4.2.0-alpha.1 <5`, `react >=16` |
| lucide-react | 1.60.0 | `^1.60.0` | `npm view lucide-react version` | 唯一图标源 |
| clsx | 2.1.1 | `^2.1.1` | `npm view clsx version` | 仅用于类名拼接 |

### 2.2 构建与工程（`devDependencies`）

| 包 | 版本 | 写法 | 验证命令 | 备注 |
| :-- | :-- | :-- | :-- | :-- |
| vite | 8.3.4 | `^8.3.4` | `npm view vite version` | |
| @vitejs/plugin-react | 6.1.2 | `^6.1.2` | `npm view @vitejs/plugin-react version` | peer: `vite ^8.0.0`；oxc/babel 相关 peer 均为 optional |
| typescript | 7.0.2 | `~7.0.2` | `npm view typescript version` | TS 7 为原生端口，锁 minor |
| @types/react | 19.3.0 | `^19.3.0` | `npm view @types/react version` | |
| @types/react-dom | 19.3.0 | `^19.3.0` | `npm view @types/react-dom version` | |
| @types/node | 22.20.5 | `^22.20.5` | `npm view @types/node@22 version` | 对齐 Node 22 |
| tailwindcss | 4.3.3 | `^4.3.3` | `npm view tailwindcss version` | |
| @tailwindcss/vite | 4.3.3 | `^4.3.3` | `npm view @tailwindcss/vite version` | 用 Vite 插件，**不再配 PostCSS / tailwind.config.js** |
| vite-plugin-pwa | 2.0.0 | `^2.0.0` | `npm view vite-plugin-pwa version` | |
| workbox-build | 7.4.1 | `^7.4.1` | `npm view workbox-build version` | **必装**：vite-plugin-pwa 2.0.0 的 required peer |
| workbox-window | 7.4.1 | `^7.4.1` | `npm view workbox-window version` | **必装**：同上 |
| vitest | 5.0.5 | `^5.0.5` | `npm view vitest version` | |
| @vitest/coverage-v8 | 5.0.5 | `^5.0.5` | `npm view @vitest/coverage-v8 version` | |
| fake-indexeddb | 6.2.6 | `^6.2.6` | `npm view fake-indexeddb version` | |
| jsdom | 30.1.3 | `^30.1.3` | `npm view jsdom version` | 组件测试环境 |
| @playwright/test | 1.64.1 | `^1.64.1` | `npm view @playwright/test version` | |
| @testing-library/react | 16.3.3 | `^16.3.3` | `npm view @testing-library/react version` | |
| eslint | 10.13.0 | `^10.13.0` | `npm view eslint version` | flat config |
| typescript-eslint | 8.72.0 | `^8.72.0` | `npm view typescript-eslint version` | |
| eslint-plugin-react-hooks | 7.1.1 | `^7.1.1` | `npm view eslint-plugin-react-hooks version` | |
| eslint-plugin-react-refresh | 0.5.7 | `^0.5.7` | `npm view eslint-plugin-react-refresh version` | |
| globals | 17.13.0 | `^17.13.0` | `npm view globals version` | |
| prettier | 3.9.10 | `^3.9.10` | `npm view prettier version` | |

### 2.3 锁版本硬规则

1. `ts-fsrs` **必须精确版本**（`"ts-fsrs": "5.4.2"`），package.json 中不得出现 `^`/`~`。
2. 仓库必须提交 `package-lock.json`；CI 用 `npm ci`，禁止 `npm install` 写 lock。
3. 任何依赖升版必须：① 更新本表 ② 跑 §12 端到端验证 ③ 涉及 `ts-fsrs` 时**必须用固定 ReviewLog 回放回归**（见 ADR-002）。
4. 禁止在未执行 `npm view` 的情况下向 package.json 写入版本号。

---

## 3. 系统分层与模块边界

### 3.1 分层图

```
┌────────────────────────────── 表现层  src/ui ──────────────────────────────┐
│ views/        StudyView · PlanView · VocabularyView · SettingsView ·         │
│               OnboardingTestView · DashboardView · LookupDialog              │
│ components/   CardFront · CardBack · SenseFreqBar · ConfidenceBadge ·        │
│               BottomBar · HotkeyHintBar · BackupPanel · Modal(原生 dialog)   │
│ hotkeys/      hotkeyBus.ts · keyMap.ts · useHotkeys.ts                       │
│ icons.ts      唯一图标出口（lucide-react 白名单再导出）                       │
│ 纪律：只渲染 + 派发意图；禁止 import src/storage/**；禁止写业务逻辑           │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ intent / query
┌──────────────────────────────────▼──────────────────────────────────────────┐
│ 应用层  src/app                                                              │
│ StudySessionProvider（useReducer 持有会话状态机）                            │
│ reviewUseCase.ts（buildCommitPlan → applyCommitPlan → 推进队列）             │
│ onboardingUseCase.ts · backupUseCase.ts · queries.ts（只读 useLiveQuery）    │
│ 纪律：唯一的事务边界持有者；装配 domain 纯函数 + storage 仓储 + clock         │
└──────────┬───────────────────────────────────┬──────────────────────────────┘
           │                                   │
┌──────────▼──────────────────┐   ┌────────────▼─────────────────────────────┐
│ 领域层  src/domain          │   │ 内容层  src/content                       │
│ clock.ts   day.ts           │   │ packLoader.ts（下载 / 校验 / 缓存编排）    │
│ planner.ts scheduler.ts     │   │ packVerifier.ts（sha256 + 形状断言）       │
│ sessionQueue.ts             │   │ packCache.ts（分块仓储）                   │
│ reviewCommitter.ts          │   │ dictionary.ts（查词 / 词形还原，P1 扩大）  │
│ cardFactory.ts  undo.ts     │   └────────────┬──────────────────────────────┘
│ ports/*.ts（仓储端口接口）   │                 │
│ 纯 TS：禁 import Dexie/React │                 │
│ 禁触碰 window/document       │                 │
└──────────┬───────────────────┘                 │
           │ 依赖倒置（storage 实现 ports）      │
┌──────────▼────────────────────────────────────▼─────────────────────────────┐
│ 存储层  src/storage                                                          │
│ db.ts（Dexie 实例 + schemaVersion 迁移）  repositories/（每资源一个文件）    │
│ mappers.ts（Domain<->DTO，Date <-> epoch ms）  persistence.ts（persist 申请）│
│ backupService.ts（导出 / 导入 / 迁移前自动备份）                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 依赖方向（出现即不合格）

```
允许：ui → app → domain        app → content        app → storage
允许：domain → domain/ports（仅类型，不含实现）
允许：storage → domain（实现 ports，可 import 领域类型）

禁止：domain → storage / ui / app      （反向或跨层）
禁止：domain → 任何 DOM、window、document、localStorage
禁止：ui → storage                     （读写一律经 app/queries.ts 与 app 用例）
禁止：content → domain/sessionQueue    （内容层只提供数据与查词）
禁止：任何层 import 未经 src/ui/icons.ts 的图标
```

### 3.3 目录结构（可执行）

```
examflow-vocab/
├── docs/
│   ├── 02-ARCHITECTURE.md                 # 本文
│   └── decisions/
│       ├── ADR-001.md  ADR-002.md  ADR-003.md  ADR-004.md
│       └── OPEN-DECISIONS.md
├── public/
│   ├── packs/ielts/1.0.0/manifest.json    # 首块随应用发布（chunk-0 + lemma-map）
│   ├── packs/ielts/1.0.0/chunk-0.json
│   ├── packs/ielts/1.0.0/lemma-map.json
│   └── icons/                             # PWA 图标（192/512/maskable）
├── src/
│   ├── main.tsx                           # 入口：只装配（<100 行）
│   ├── App.tsx                            # 视图装配：只装配（<100 行）
│   ├── styles/theme.css                   # @theme 语义令牌（唯一颜色来源）
│   ├── types/
│   │   ├── content.ts        # Word / Sense / ExampleSentence / ExamCode
│   │   ├── pack.ts           # PackManifestV1 / PackChunkV1 / LemmaMapV1
│   │   ├── domain.ts         # Card / ReviewLog / Settings / UserWordMeta / CustomWord / SessionState
│   │   └── index.ts
│   ├── domain/
│   │   ├── clock.ts          # Clock 接口 + systemClock + manualClock
│   │   ├── day.ts            # 学习日键 / 日切 / 距考天数
│   │   ├── cardFactory.ts    # 义项 → 卡片定义（主义项卡 / 僻义卡）
│   │   ├── scheduler.ts      # ts-fsrs 封装 + 考期截断（含自研夹取）
│   │   ├── planner.ts        # 每日计划 / 复习排序 / 过轮分配
│   │   ├── sessionQueue.ts   # 日内重现队列 + 显式 current
│   │   ├── reviewCommitter.ts# 生成 CommitPlan（纯函数）
│   │   ├── undo.ts           # UndoEntry 类型与快照应用
│   │   └── ports/
│   │       ├── cardRepo.ts  reviewLogRepo.ts  settingsRepo.ts
│   │       └── wordMetaRepo.ts  sessionStateRepo.ts
│   ├── content/
│   │   ├── packLoader.ts  packVerifier.ts  packCache.ts  dictionary.ts
│   ├── storage/
│   │   ├── db.ts  mappers.ts  persistence.ts  backupService.ts
│   │   └── repositories/
│   │       ├── cardRepo.ts  reviewLogRepo.ts  settingsRepo.ts
│   │       ├── wordMetaRepo.ts  sessionStateRepo.ts  packChunkRepo.ts
│   ├── app/
│   │   ├── StudySessionProvider.tsx
│   │   ├── reviewUseCase.ts  onboardingUseCase.ts  backupUseCase.ts
│   │   ├── transactions.ts   # Dexie 事务包装（唯一 db.transaction 出现处）
│   │   └── queries.ts        # 只读 useLiveQuery 封装
│   ├── ui/
│   │   ├── views/  components/  hotkeys/  hooks/
│   │   └── icons.ts
│   └── test/setup.ts
├── tests/
│   ├── unit/         # domain 纯函数，注入固定时钟
│   ├── integration/  # Dexie 事务 / 备份往返 / 数据包校验，fake-indexeddb
│   └── e2e/          # Playwright：桌面 Chrome / WebKit / 移动视口
├── vite.config.ts   tsconfig.json   eslint.config.js   package.json
```

### 3.4 文件组织硬规则

| # | 规则 | 门禁 |
| :-- | :-- | :-- |
| 1 | 单文件 **≤ 300 行**（不含空行与注释），超限按子功能拆文件（不是拆函数凑数） | CI 见 §12.4 |
| 2 | 一个文件一个主职责、一个主导出 | Code Review |
| 3 | `main.tsx` / `App.tsx` 只装配，行数 < 100，禁止出现业务分支 | CI |
| 4 | `db.transaction` **只允许出现在 `src/app/transactions.ts`** | grep 门禁 |
| 5 | `lucide-react` **只允许被 `src/ui/icons.ts` import** | ESLint `no-restricted-imports` |
| 6 | `new Date()` / `Date.now()` **不允许出现在 `src/domain/**`**（必须走 `Clock`） | ESLint `no-restricted-syntax` |
| 7 | 颜色字面量（hex / rgb( / hsl(）与 Tailwind 任意值颜色语法**不允许出现在 `src/**`** | 正则门禁，见 §10.3 |
| 8 | 单元测试中不得出现真实时钟（必须 `manualClock`） | Code Review |

---

## 4. 领域层接口契约

> 以下签名即契约。实现文件名已点名，不得挪位。

### 4.1 `src/domain/clock.ts`

```typescript
export interface Clock { now(): number; }                 // epoch ms
export const systemClock: Clock;
export function manualClock(initialMs: number): Clock & { set(ms: number): void; advanceMs(ms: number): void };
```

### 4.2 `src/domain/day.ts`

```typescript
export interface DayRules { dayStartHour: number; }       // 默认 4，来自 Settings

/** 学习日键：本地日期减 dayStartHour 后取 'YYYY-MM-DD'。04:00 之前计入前一天。 */
export function studyDayOf(ts: number, dayStartHour: number): string;
/** 学习日起点时间戳（本地时间该日 dayStartHour 整点）。 */
export function studyDayStartTs(dayKey: string, dayStartHour: number): number;
/** 学习日键加/减天数。 */
export function addDays(dayKey: string, n: number): string;
/** 距考天数 D：考试当天 0，考后为负。 */
export function daysToExam(ts: number, examDate: string, dayStartHour: number): number;
```

约束：`studyDayStartTs` 必须用 `new Date(y, m - 1, d, hour)` 构造，**禁止用 `ts ± 24h` 累加**（DST 会偏 1 小时，见 §11.15）。

### 4.3 `src/domain/scheduler.ts`

```typescript
import { createEmptyCard, fsrs, type Card as FsrsCard, type Grade, Rating } from 'ts-fsrs';

export type UserRating = 'AGAIN' | 'HARD' | 'GOOD';

export interface ScheduleContext {
  daysToExam: number;        // D
  now: Date;
  studyDayKey: string;
  dayStartHour: number;
  mode: 'EXAM' | 'LONG_TERM';
  enableFuzz: boolean;       // 生产 true，单测必须 false
}

/** PRD §5.5.2：目标留存率随考期提高 */
export function requestRetentionFor(D: number): number;    // D<=7:0.95 | D<=30:0.93 | else:0.90
/** PRD §5.5.1：间隔上限，单位天 */
export function maxIntervalFor(D: number, mode: 'EXAM' | 'LONG_TERM'): number; // max(1, D-1) | 36500

export function buildFsrs(ctx: ScheduleContext): ReturnType<typeof fsrs>;
export function newFsrsCard(now: Date): FsrsCard;
export function ratingToGrade(r: UserRating): Grade;

export interface ScheduleResult {
  fsrsCard: FsrsCard;
  intervalDays: number;      // 已夹取
  dueAt: number;             // epoch ms，学习日起点
  rating: UserRating;
}
export function scheduleReview(card: FsrsCard, rating: UserRating, ctx: ScheduleContext): ScheduleResult;

/** 预测某时刻的回忆概率 R；北极星指标与复习排序均依赖它 */
export function retrievabilityAt(card: FsrsCard, at: Date, ctx: ScheduleContext): number;
```

**考期截断的实现顺序（顺序不可颠倒）**：

```typescript
// 1) 用考期参数构造 fsrs 实例（maximum_interval 只是"建议"，见 §11.1）
const f = buildFsrs(ctx);
// 2) 取得 ts-fsrs 输出
const { card: next, log } = f.next(card, ctx.now, ratingToGrade(rating));
// 3) 我们自己的夹取 —— 这一行是 I_final = min(I_fsrs, max(1, D-1)) 的唯一落地处
const intervalDays = clampInt(log.scheduled_days, 1, maxIntervalFor(ctx.daysToExam, ctx.mode));
// 4) 到期时刻对齐到学习日起点
const dueAt = studyDayStartTs(addDays(ctx.studyDayKey, intervalDays), ctx.dayStartHour);
```

`buildFsrs` 固定注入：`enable_short_term: false`（日内重复全部交给 `SessionQueue`，见 §5.3）、`request_retention: requestRetentionFor(D)`、`maximum_interval: maxIntervalFor(D, mode)`、`enable_fuzz: ctx.enableFuzz`。

### 4.4 `src/domain/planner.ts`

```typescript
export interface DailyNewInput { remainingCards: number; /* N */ daysToExam: number; /* D */ maxNewPerDay: number; }
export interface DailyNewPlan {
  sweepDays: number;          // B
  usableDays: number;         // max(1, D - B)
  rawDailyNew: number;        // ceil(N / usableDays)
  dailyNew: number;           // min(M_new, raw)，过轮窗口内为 0
  feasible: boolean;          // raw <= M_new
  coverageIfLimited: number;  // 0~1，用于"学不完"提示
  inSweepWindow: boolean;
}

export function sweepDays(D: number): number;             // D>21:7 | D>=0:max(1,floor(D/3)) | D<0:0
export function computeDailyNew(input: DailyNewInput): DailyNewPlan;

export type TierWeight = 1.0 | 0.7 | 0.4;                 // 核心 / 进阶 / 其他（PRD §5.3 假设值）
export function reviewPriority(tierWeight: TierWeight, rNow: number): number; // tier * (1 - R_now)

/** 考前过轮：把核心卡中 R(exam) < 0.9 且窗口内无到期安排的卡均匀分配到窗口各天 */
export function buildSweepAssignments(
  cards: Array<{ cardId: string; rAtExam: number; dueAt: number; isCore: boolean }>,
  window: Array<{ studyDayKey: string; startTs: number }>,
  examStartTs: number,
): Map<string /* cardId */, string /* studyDayKey */>;
```

### 4.5 `src/domain/sessionQueue.ts`

```typescript
export interface QueueItem { cardId: string; score: number; requeued: boolean; atSeq: number; notBefore: number; }
export interface SessionQueueSnapshot { items: QueueItem[]; seq: number; completed: string[]; currentCardId: string | null; }

export class SessionQueue {
  constructor(opts?: { minGapCards?: number; minGapMs?: number });  // 默认 3 / 60000
  /** 当前卡片由队列显式持有；背面所有操作作用于 current，禁止通过队首推断 */
  currentCardId: string | null;
  setCurrent(cardId: string): void;
  peekEligible(now: number): QueueItem | null;
  /** PRD §5.6 通关判定（纯函数，可单测） */
  static outcome(item: QueueItem, rating: UserRating): { passed: boolean; score: number };
  preview(cardId: string, rating: UserRating): { passed: boolean; score: number };
  commit(cardId: string, rating: UserRating, now: number): { passed: boolean; score: number };
  removeWhere(pred: (cardId: string) => boolean): void;
  pendingCount(now: number): number;
  snapshot(): SessionQueueSnapshot;
  restore(s: SessionQueueSnapshot): void;
}
```

PRD §5.6 规则映射（照抄原型实现，已与 PRD 对齐）：
- 首次出现即「认识」→ 直接通关；「不认识」→ score 置 0 重排；「模糊」→ score 置 1 重排；被打回后「认识」→ score+1，`score >= 2` 通关。
- 重插位置：`min(minGapCards, items.length)`，且 `notBefore = now + minGapMs`；`isEligible = !requeued || (seq - atSeq >= minGapCards && now >= notBefore)`。
- 剩余卡不足以满足间隔 → 该卡留在队列中等待（本轮其他卡完成后出现；用户结束本轮则进入当日下一轮开头）。

### 4.6 `src/domain/reviewCommitter.ts` 与 `src/domain/undo.ts`

```typescript
export interface CommitInput {
  card: Card;                       // src/types/domain.ts
  rating: UserRating;
  prejudged: boolean;
  corrected: boolean;
  durationMs: number;
  now: number;
  studyDayKey: string;
  ctx: ScheduleContext;
  clock: Clock;
}
export interface CommitPlan {
  cardBefore: Card | null;          // 撤销快照（整卡深拷贝）
  cardAfter: Card;
  log: ReviewLog;                   // 含 sessionOnly 与 fsrsBefore
  queueMutation: { cardId: string; rating: UserRating; now: number } | null;
  undoEntry: UndoEntry;
}
export function buildCommitPlan(input: CommitInput): CommitPlan;   // 纯函数，零副作用

export type UndoEntry =
  | { type: 'COMMIT';  studyDay: string; cardId: string; cardBefore: Card | null; queueSnapshot: SessionQueueSnapshot; logId: string }
  | { type: 'SUSPEND'; studyDay: string; cardsBefore: Record<string, Card | null>; queueSnapshot: SessionQueueSnapshot; currentCardId: string };

export function isUndoValid(entry: UndoEntry | null, currentStudyDay: string): boolean;  // 跨日切失效
export function buildSuspendPlan(cards: Card[], queue: SessionQueue, studyDay: string): { cardsAfter: Card[]; undoEntry: UndoEntry };
```

### 4.7 `src/domain/cardFactory.ts`

```typescript
export interface CardDef { id: string; /* `${exam}:${senseId}` */ exam: ExamCode; wordId: string; senseId: string; kind: 'PRIMARY' | 'ECCENTRIC' | 'CUSTOM'; freq: number; }
/** 每词 1 张主义项卡（该考试考频最高的义项）+ 每个熟词僻义 1 张僻义卡，每词最多 3 张。 */
export function buildCardDefs(word: Word, exam: ExamCode): CardDef[];
/** 核心卡判定：按义项考频降序，前 30%（PRD §2.1）。 */
export function markCore(defs: CardDef[]): CardDef[];   // 写回 isCore
```

确定性要求：主义项取 `examStats[exam].freq` 最大者；**并列时按 `senseId` 字典序升序**取第一个。僻义卡按 freq 降序取前 2 个 `isEccentric` 义项（`senseId` 字典序破并列）。**卡片定义不写入数据包，由客户端派生**，规则变更无需重新发布数据包；`Card.id` 由 `senseId` 决定，永不复用，跨版本进度可迁移。

---

## 5. 调度细节（PRD §5.5 / §5.6 落地）

### 5.1 考期截断

- 公式：`I_final = min(I_fsrs, max(1, D - 1))`，`D` 为本次复习时的距考天数。
- 落地位置：`src/domain/scheduler.ts` 的 `scheduleReview()` 第 3 步（§4.3）。
- **不依赖 ts-fsrs 的 `maximum_interval` 生效**：实测 5.4.2 对新卡完全忽略该参数、对复习卡可能返回 `maximum_interval + 1`（§11.1），因此自建夹取是唯一可信路径。
- 期望值（对齐 PRD T-01 / T-02）：`D = 10` → `intervalDays ≤ 9`；`D = 1` → `intervalDays = 1`。

### 5.2 每日首评

- 判据：`card.lastFirstReviewDay !== 当前学习日键`。
- 首评：调用 `scheduleReview` 更新 FSRS，写 `lastFirstReviewDay = studyDayKey`，日志 `sessionOnly = false`。
- 同日重现：**不调用 FSRS**，只推进 `SessionQueue`，日志 `sessionOnly = true`，`fsrsBefore` 仍记录（便于审计）。
- 对齐 PRD T-04：Again → Good → Good 同一学习日，仅第一次改 FSRS 状态，后两条 `sessionOnly = true`。

### 5.3 短期间隔：关闭

`buildFsrs` 固定 `enable_short_term: false`。若开启，ts-fsrs 会给出分钟级 `due`（实测 `st=true` 时 Good 给 `scheduled_days=0, due=now+10min`），与"每卡每学习日仅首评进 FSRS"直接冲突，并会让到期列表在同一天反复命中。日内重复一律由 `SessionQueue` 负责。

### 5.4 兄弟卡错开

`planner` 选卡时维护 `wordsTouched: Set<wordId>`（来源：当日 `sessionOnly=false` 日志反查 `wordId` + 本轮已选卡）。同一 `wordId` 当日最多 1 张入选。新卡阶段额外约束：若该词主义项卡仍为 `NEW`，其僻义卡不放行（主义项先学）。对齐 T-10。

### 5.5 撤销

- 只保留**最近一条** `UndoEntry`（PRD §5.2.6）。
- 撤销动作（在**同一个 Dexie 事务**内完成）：恢复 `cardBefore` 快照 → 按 `logId` 删除日志 → `queue.restore(snapshot)` → `queue.setCurrent(cardId)`。
- 用**快照恢复**而非 `fsrs.rollback()`：实测 `rollback` 在本版可精确还原，但快照法跨版本更稳，且撤销范围还包含队列与日志。
- 斩词可撤销，走 `SUSPEND` 类型。
- 跨日切失效：加载会话时若 `undoEntry.studyDay !== studyDayOf(now)` 则清空。
- 对齐 T-07：撤销后卡片 FSRS 状态逐字段等于提交前，对应日志被删除，该卡回到当前位置。

### 5.6 斩词

按 `X`：取当前词的全部 `CardDef.id`，置 `suspended = true`，`SessionQueue.removeWhere` 移除，随后 `advance()`。**不调用 FSRS**。词库页可恢复（`unsuspendWord`）。对齐 PRD §5.2.7。

### 5.7 日切

`settings.dayStartHour`（默认 4，可配置，范围 0–6）。所有"学习日"判定统一走 `domain/day.ts`，**禁止其它文件自行算日切**。对齐 T-03。

### 5.8 考前过轮

进入 `D <= B` 窗口时，`buildSweepAssignments` 产出 `cardId → studyDayKey` 映射，写入独立表 `sweepPlan`。**不修改 Card 的 FSRS 状态**，仅在当日选卡时追加这批卡。

---

## 6. 数据包契约（PRD §7.1 细化）

### 6.1 路径与文件

```text
/packs/ielts/manifest.json                 # 常驻（无版本前缀，指向当前版本）
/packs/ielts/1.0.0/chunk-0.json            # 每块约 500 词
/packs/ielts/1.0.0/chunk-1.json
/packs/ielts/1.0.0/lemma-map.json
```

首块（`chunk-0` + `lemma-map`）随应用发布在 `public/`，保证**首次启动即可离线学习**；其余块按需下载。

### 6.2 `manifest.json`

| 字段 | 类型 | 必填 | 说明 |
| :-- | :-- | :-- | :-- |
| `exam` | `ExamCode` | 是 | `'IELTS'` |
| `version` | `string` | 是 | 语义化版本，如 `1.0.0` |
| `schemaVersion` | `number` | 是 | 数据包**结构**版本（当前 1），与 `version` 独立 |
| `minAppVersion` | `string` | 是 | 低于此版本的应用提示升级 |
| `generatedAt` | `string` | 是 | ISO 8601 带时区 |
| `chunkSize` | `number` | 是 | 每块词数（500） |
| `wordCount` | `number` | 是 | 总词数 |
| `chunks` | `ChunkRef[]` | 是 | 见下 |
| `lemmaMap` | `FileRef` | 是 | **本 Spec 新增**：lemma-map 独立校验（PRD 原文未列） |
| `deprecatedWordIds` | `string[]` | 是 | 废弃词（保留、不进新卡队列） |
| `license` | `string` | 是 | 授权声明全文（ECDICT MIT / WordNet 声明 / 仿真例句说明） |
| `licenseUrl` | `string` | 否 | |

`ChunkRef`：`{ n: number; wordCount: number; sha256: string; bytes: number }`
`FileRef`：`{ sha256: string; bytes: number; entries?: number }`

### 6.3 `chunk-N.json`

```json
{
  "exam": "IELTS",
  "version": "1.0.0",
  "schemaVersion": 1,
  "n": 0,
  "words":    [ /* Word[]  ，见 src/types/content.ts */ ],
  "examples": [ /* ExampleSentence[]，senseId 关联义项，不用字符串匹配 */ ]
}
```

**不随包下发卡片定义**（`cards` 由 `domain/cardFactory.ts` 派生，理由见 §4.7）。

`Word`：`{ id, lemma, phoneticUk, phoneticUs, isBasic, senses[], etymology?, confusables[], synonyms[], deprecated? }`
`Sense`：`{ id, pos, cn, enDef?, examStats: Partial<Record<ExamCode, { freq, share, isEccentric, years[] }>> }`
`ExampleSentence`：`{ id, wordId, senseId, en, zh, surfaceForm, provenance }`

MVP 例句：`provenance` **一律 `{ type: 'ADAPTED', note: '仿真例句' }`**（team-lead 已定：例句全部为仿真例句并显式标注）。`REAL_EXAM` 分支在类型中保留，MVP 不产出。

### 6.4 `lemma-map.json`

```json
{ "exam": "IELTS", "version": "1.0.0", "schemaVersion": 1,
  "map": { "addressed": "address", "potentials": "potential" } }
```

供 P1 点词即查使用（PRD §5.8）。MVP 需加载但可延迟（首屏不阻塞）。

### 6.5 校验与下载

1. 启动：`fetch('/packs/ielts/manifest.json', { cache: 'no-store' })`。
2. 逐文件 `crypto.subtle.digest('SHA-256', bytes)` → 十六进制比对 `sha256`。
3. **校验失败：不写入缓存，重试最多 2 次，仍失败则报错并保留旧版本数据**（对齐 T-15）。
4. 版本升级：逐块比对 `sha256`，**只下载变化的块**；已缓存块不重下。
5. `deprecatedWordIds`：卡片保留历史与复习日志，详情页显示"该词已在新版词库中移除"，**不进新卡队列**。
6. `wordId` / `senseId` **一经发布永不复用**，确保 `Card.id = ${exam}:${senseId}` 跨版本稳定。
7. `minAppVersion` 高于当前应用版本：提示升级但不阻断（离线优先）。

### 6.6 JSON → TS 类型映射

| JSON 文件 | TS 类型（文件位置） | 运行时校验入口 |
| :-- | :-- | :-- |
| `manifest.json` | `PackManifestV1`（`src/types/pack.ts`） | `content/packVerifier.ts::assertManifest` |
| `chunk-N.json` | `PackChunkV1`（含 `Word[]` / `ExampleSentence[]`，类型定义在 `src/types/content.ts`） | `content/packVerifier.ts::assertChunk` |
| `lemma-map.json` | `LemmaMapV1`（`src/types/pack.ts`） | `content/packVerifier.ts::assertLemmaMap` |

映射纪律：`src/types/pack.ts` 只描述**线上 JSON 形状**（可含可选字段）；`src/types/content.ts` 描述**运行时领域对象**（字段补齐后）。两者由 `content/packLoader.ts` 显式转换，**禁止把 pack 类型直接当领域类型用**。

---

## 7. 存储层设计

### 7.1 Dexie Schema（`src/storage/db.ts`）

数据库名 `examflow-vocab`，Dexie version 1（`schemaVersion = 1` 写在 Settings 里，与 Dexie version 一致）。

| 表 | 主键 | 索引 | 内容 |
| :-- | :-- | :-- | :-- |
| `cards` | `id`（`${exam}:${senseId}`） | `exam`, `wordId`, `senseId`, `dueAt`, `suspended`, `[exam+dueAt]` | 用户卡片 + FSRS 状态 |
| `reviewLogs` | `id` | `cardId`, `studyDay`, `reviewedAt`, `[cardId+studyDay]` | 复习日志 |
| `settings` | `id`（固定 `'default'`） | — | Settings 单行 |
| `userWordMeta` | `wordId` | `updatedAt` | 星标 / 笔记 |
| `customWords` | `id`（`cw_` 前缀） | `lemma` | P1，MVP 建表不用 |
| `packChunks` | `[exam+version+n]` | `exam`, `version` | 数据包分块缓存（原文 JSON 字符串） |
| `sessionState` | `id`（固定 `'default'`） | — | 队列快照 / current / stage / rating / undoEntry |
| `sweepPlan` | `studyDayKey` | — | 过轮分配 |

### 7.2 时间序列化（硬规则）

- **IndexedDB 与备份 JSON 中，所有时间字段一律为 epoch ms 整数**（字段名以 `At` 结尾，如 `dueAt` / `reviewedAt` / `lastFirstReviewDay` 例外——它是 `'YYYY-MM-DD'` 字符串）。
- **禁止把 `Date` 对象直接写入 IndexedDB 或 JSON**。领域层用 `Date`，`storage/mappers.ts` 负责双向转换。
- 理由：JSON 往返会把 `Date` 变成 ISO 字符串，导入后与原生 `Date` 混用会产生"能读、能写、但比较全错"的沉默逻辑错误。

### 7.3 事务边界（硬规则）

一次评分提交 = `cards` 更新 + `reviewLogs` 写入 + `sessionState` 更新，**必须在同一个 `rw` 事务内原子执行**（PRD §6）。

```typescript
// src/app/transactions.ts —— 全项目唯一允许出现 db.transaction 的文件
export async function applyCommitPlan(plan: CommitPlan, queueSnapshot: SessionQueueSnapshot): Promise<void> {
  await db.transaction('rw', db.cards, db.reviewLogs, db.sessionState, async () => {
    await db.cards.put(toCardRow(plan.cardAfter));
    await db.reviewLogs.add(toLogRow(plan.log));
    await db.sessionState.put({ id: 'default', queue: queueSnapshot, undoEntry: plan.undoEntry, /* ... */ });
  });
}
```

**事务体内只允许 Dexie 操作与纯计算**：FSRS 计算、队列推进、撤销快照都在**进入事务之前**由领域层算完（`buildCommitPlan` 是纯函数）。事务内 `await` 任何非 Dexie Promise 会触发隐式提交 / `TransactionInactiveError`（§11.21）。

### 7.4 迁移

`schemaVersion` 变化时执行迁移脚本；**迁移前自动导出一份本地备份**（PRD §6）。`Settings.schemaVersion` 与 Dexie version 双向校验，不一致时以 Dexie version 为准并写回。

### 7.5 持久化申请

`navigator.storage.persist()` **必须在用户手势回调中调用**（引导"添加到主屏幕"之后的按钮），不在启动流程静默调用——iOS Safari 在非手势上下文恒返回 `false`，且 iOS 16 前仅 Home Screen 安装的 PWA 有资格（§11.11）。结果写入 `Settings`，用于"数据可能丢失"提示文案。

---

## 8. 备份文件格式（PRD §7.2 落地）

```json
{
  "format": "examflow-backup",
  "formatVersion": 1,
  "exportedAt": "2026-10-20T12:00:00+08:00",
  "schemaVersion": 1,
  "appVersion": "1.0.0",
  "exam": "IELTS",
  "packVersion": "1.0.0",
  "settings": {},
  "cards": [],
  "reviewLogs": [],
  "userWordMeta": [],
  "customWords": []
}
```

规则：
1. `format` 不等于 `examflow-backup` → 拒绝导入。
2. `formatVersion` 高于客户端支持版本 → 拒绝并提示升级。
3. 导入前**先自动导出当前数据**为一份文件（PRD §7.2）。
4. 默认「覆盖」；可选「按 `updatedAt` / `reviewedAt` 后写覆盖合并」。
5. 导入在同一 `rw` 事务内完成，失败整体回滚。
6. 对齐 T-12：导出 → 清库 → 导入后，所有实体与导出前完全一致（时间字段为 epoch ms 整数，逐字段比对）。

---

## 9. UI 层与快捷键

### 9.1 HotkeyBus（`src/ui/hotkeys/`）

单一 `window.addEventListener('keydown')`，判定顺序**不可调换**：

1. 若弹窗栈非空：仅处理 `Escape`（关闭栈顶），其余全部吞掉。
2. 若目标为 `INPUT` / `TEXTAREA` / `SELECT` / `contenteditable`：全部吞掉。
3. 若按下 `Ctrl` / `Meta` / `Alt`：吞掉（放行浏览器快捷键）。
4. 若当前视图非 `study`：仅处理导航键。
5. 其余按 `src/ui/hotkeys/keyMap.ts` 分发。

按键识别**以 `event.code` 为主**（`Digit1` / `Digit2` / `Digit3` / `Space` / `KeyZ` / `KeyX` / `KeyC` / `KeyR` / `KeyF` / `Enter` / `ArrowRight`），`event.key` 仅作兜底——中文输入法激活时 `event.key` 会变成 `'Process'`（§11.14）。

命中处理必须 `event.preventDefault()`，避免 Space 滚动页面 / 触发聚焦按钮的 click（§11.16）。

### 9.2 视图与移动端

- 视口 `< 768px` 时渲染 `BottomBar`：正面「不认识 / 模糊 / 认识」，背面「记错了 / 模糊 / 下一个」（下一个占最大面积）。按钮最小高度 44px，容器 `padding-bottom: max(12px, env(safe-area-inset-bottom))`。
- **不使用 `user-scalable=no`**（PRD §5.4）。
- 次要模块（词根 / 形近词 / 笔记）默认折叠。

### 9.3 弹窗

一律用原生 `<dialog>` + `showModal()`：自带焦点循环与 Esc 行为，无需组件库。弹窗开关维护 `modalStack`（栈顶优先）。

---

## 10. 图标与设计令牌（P0 硬约束落地）

### 10.1 图标

- **唯一图标库：`lucide-react 1.60.0`**，全项目不得混用第二套图标。
- **唯一出口：`src/ui/icons.ts`**，只再导出本项目实际使用的图标白名单；其它文件禁止 `import ... from 'lucide-react'`（ESLint `no-restricted-imports` 拦截）。
- **尺寸只允许 16 / 20 / 24 px**，统一 `strokeWidth={1.75}`，通过白名单包装组件固定，不在业务组件里传 `size`。
- 传入方式：`<IconCheck />`、`<IconX size={16} />` 之外的任意尺寸值不得出现。

### 10.2 禁止 emoji

`src/**` 与所有面向用户的文案中**禁止出现 emoji**（含图标位、徽章位、按钮文案、toast）。CI 用 Unicode 区段正则扫描，命中即失败（§12.4）。

### 10.3 颜色

- 颜色**只来自 `src/styles/theme.css` 的 `@theme` 语义令牌**。
- 令牌名由架构侧锁定（语义角色），**具体色值由设计侧填写**。基线清单：

```text
surface / surface-raised / surface-sunken
fg / fg-muted / fg-subtle
line / line-strong
brand / brand-fg / brand-subtle
success / warning / danger / info （及其 -fg / -subtle）
focus-ring
rating-again / rating-hard / rating-good
```

- 禁止项（正则门禁，命中即失败）：
  - 6 位 / 3 位十六进制颜色字面量 `#rrggbb`
  - `rgb(` / `rgba(` / `hsl(` / `oklch(` 字面量出现在 `src/**`（`theme.css` 除外）
  - Tailwind 任意值颜色语法：`bg-[#...]`、`text-[rgb(...)]`、`border-[#...]`
  - 内联 `style={{ color / background ... }}`
- 禁止定义或实现**紫色→粉色渐变**类视觉方案；`theme.css` 中不提供 gradient 令牌。
- 熟词僻义徽章、考频占比条、评分按钮等语义色一律引用上述令牌，组件内不得出现色值判断。

---

## 11. 已知坑登记（本项目技术栈高频坑）

> 每条都配可执行的规避动作。标 **[实测]** 的为本次在本机验证过的事实，非推测。

### 11.1 [实测] ts-fsrs 5.4.2 的 `maximum_interval` 不可依赖

验证脚本（`ts-fsrs@5.4.2`，`enable_fuzz:false`，`enable_short_term:false`）：

```
新卡首次评分（Good）：  mi=1 -> scheduled_days=3   mi=2 -> 3   mi=5 -> 3   mi=36500 -> 3
复习卡（S=60, elapsed=0）：mi=36500 -> 61   mi=20 -> 21   mi=9 -> 10
复习卡（S=60, elapsed=10）：mi=36500 -> 82   mi=20 -> 21   mi=9 -> 10
```

结论：
- **New 状态卡片完全忽略 `maximum_interval`**。
- **Review 状态卡片的裁剪结果可能是 `maximum_interval + 1`**。

规避：`domain/scheduler.ts` 必须用自己的 `clampInt(scheduled_days, 1, maxIntervalFor(D))`，`maximum_interval` 仅作为传给 ts-fsrs 的辅助参数（§4.3）。单测不得用"ts-fsrs 会夹取"作为断言依据。

### 11.2 [实测] ts-fsrs 5.4.2 默认权重是 FSRS-6（21 个权重），不是 FSRS-4.5（17 个）

`default_w.length === 21`，`FSRSVersion === "v5.4.2 using FSRS-6.0"`。PRD §5.5 与原型里的"FSRS-4.5（W 长度 17）"与实际库不一致。

规避：北极星指标（考试日 R ≥ 0.9 的核心卡数）、所有回归基线、原型演示数值**全部按 FSRS-6 重算**；不得把原型数值当验收基线。已登记 OPEN-DECISIONS。

### 11.3 ts-fsrs 6.0.0-beta.* 已发布（截至本次查询到 beta.15）

规避：`package.json` 写 `"ts-fsrs": "5.4.2"`（精确，无 `^`）；升大版本前必须用固定 ReviewLog 回放回归（ADR-002）。另外 `Card.elapsed_days` / `ReviewLog.elapsed_days` / `last_elapsed_days` 在本版已标 `@deprecated`（6.0.0 移除），持久化时不要依赖它们。

### 11.4 `enable_short_term` 误开

开启后 `due` 落在分钟级（实测 `scheduled_days=0, due=now+10min`），与"每日首评"冲突，到期列表同日反复命中。规避：`buildFsrs` 写死 `false`，用单测断言该参数。

### 11.5 [实测] `enable_fuzz` 默认值为 `false`

`generatorParameters()` 输出 `enable_fuzz: false`。生产建议**显式设 `true`**（FSRS 官方建议，避免到期卡堆积成山），单测**必须显式 `false`** 保证确定性。同一份参数在测试与生产不同，是可接受且有意为之。

### 11.6 Vite PWA 与 IndexedDB 的双缓存

Workbox 只缓存 HTTP 响应，**不缓存 IndexedDB**。若把 `/packs/*` 也放进预缓存，会出现"HTTP 缓存有、IndexedDB 没有（或反之）"的不一致。

规避：`workbox.runtimeCaching` 对 `/packs/**` 用 `NetworkFirst` + 独立 `cacheName`；`globPatterns` 排除 `packs/**`；SW 更新时只 `caches.delete()`，**绝不清理 IndexedDB**。

### 11.7 SW 更新打断学习

`registerType: 'autoUpdate'` 会在用户学习中途 reload，丢掉未提交的评分。规避：`registerType: 'prompt'`，收到 update 事件后显示提示条，**等本轮队列清空或用户点"下一轮"时再 reload**。

### 11.8 fake-indexeddb 集成测试

- 必须在 `src/test/setup.ts` **第一行** `import 'fake-indexeddb/auto'`。
- **禁止模块级 Dexie 单例跨测试复用**（事务会 hang），每个测试 `new Dexie(randomDbName)` 并在 `afterEach` 关闭删除。
- fake-indexeddb 不实现 `navigator.storage.persist()` / `navigator.storage.estimate()`，需 stub；`persistence.ts` 必须允许注入 storage 对象以便测试。

### 11.9 Playwright WebKit 移动端

`isMobile: true` 仅 Chromium 支持；WebKit 必须用 `devices['iPhone 13']` 之类 device descriptor。`env(safe-area-inset-bottom)` 在桌面模拟下恒为 0，断言不要依赖具体数值，只断言底栏存在且按钮 `height >= 44`。

### 11.10 PWA 图标与 maskable

`manifest` 必须同时提供 `any` 与 `maskable` purpose 的 512 图标，否则 iOS 添加到主屏幕会裁切。

### 11.11 iOS Safari 持久化

`navigator.storage.persist()` 在 iOS 16 之前**恒返回 false**，且只有添加到主屏幕的 PWA 才有资格申请。必须在用户手势回调中调用，且要把结果如实告知用户（不要假装成功）。iOS Safari 对 7 天未访问的站点会清理 IndexedDB —— 备份提醒（PRD §7.2）是刚需不是锦上添花。

### 11.12 `crypto.subtle` 需要安全上下文

局域网真机调试（`http://192.168.x.x:5173`）下 `crypto.subtle` 为 `undefined`，sha256 校验会直接抛错。规避：真机调试用 HTTPS（自签证书 + 手机信任）或 Chrome 的 `#unsafely-treat-insecure-origin-as-secure` flag；`packVerifier` 在 `crypto.subtle` 缺失时**明确报错并说明原因**，不静默跳过校验。

### 11.13 Service Worker 缓存 index.html

旧 SW 返回旧 `index.html`，引用的 chunk hash 已被新构建删除 → 白屏。规避：`navigateFallback` 指向 `index.html` 并配合 `registerType: 'prompt'`；构建产物保留版本化 hash；不要在 SW 里缓存 `/packs/*`（归 IndexedDB 管）。

### 11.14 中文输入法与 `event.key`

输入法激活时 `keydown` 的 `event.key === 'Process'`，数字键也拿不到 `'1'`。规避：`hotkeyBus` 以 `event.code` 为主。

### 11.15 日切与 DST

用 `ts ± 24h` 累加算学习日会在 DST 切换日偏 1 小时，导致 04:00 判定错位。规避：`studyDayStartTs` 用 `new Date(y, m - 1, d, hour)` 构造（§4.2）。跨时区旅行会改变 `D` —— 已接受，考试日期按本地日期存储不做时区转换（PRD §6）。

### 11.16 Space 键副作用

Space 会滚动页面，并在有聚焦按钮时触发 click。规避：命中即 `preventDefault()`；整卡容器不要用 `<button>` 包裹。

### 11.17 React 19 StrictMode 双调用

`dexie-react-hooks` 内部走 `useSyncExternalStore`，StrictMode 下会双调用订阅。规避：领域层必须是纯函数、无副作用（本架构已保证）；`useLiveQuery` 的回调不得写库。

### 11.18 Tailwind 4 与 PostCSS 二选一

用了 `@tailwindcss/vite` 就**不要再配** `postcss.config.*` 与 `tailwind.config.js`；`@tailwindcss/postcss` 与 Vite 插件不要同时启用。

### 11.19 Tailwind 4 浏览器下限

Safari 16.4 / Chrome 111 / Firefox 128（官方明示）。低于此版本 **核心功能不可用**（依赖 `@property` 与 `color-mix()`），不是"样式降级"。已作为 D-2 上报。

### 11.20 2000 词数据包解析阻塞主线程

`JSON.parse` 数 MB 文本在中端安卓机上可达数百毫秒。规避：首块随包发布；其余块按需下载并**在空闲时**解析；解析结果立刻落 `packChunks`，之后启动不再解析（只读 IndexedDB）。首屏可交互 P95 ≤ 2s 的达成依赖此路径。

### 11.21 Dexie 事务内 await 非 Dexie Promise

会触发隐式提交并抛 `TransactionInactiveError` 或静默丢事务。规避：FSRS 计算、队列推进、快照生成全部在**进入事务之前**完成（§7.3）。这是本项目最容易写出沉默数据丢失的地方。

### 11.22 时间字段 Date / string 混用

导入 JSON 后 `Date` 变 ISO 字符串，`dueAt > now` 之类的比较全部静默失效。规避：全局 epoch ms 整数（§7.2）。

---

## 12. 端到端验证步骤（收尾）

### 12.1 依赖与构建门禁

```bash
export PATH="C:/Users/dason/.workbuddy/binaries/node/versions/22.22.2-6:$PATH"
npm ci
npm run typecheck          # tsc --noEmit，必须 0 error
npm run lint               # eslint，必须 0 error（含图标/颜色/Date 规则）
npm run build              # vite build，必须成功
npx playwright install     # 首次
```

### 12.2 单元与集成

```bash
npm run test               # vitest run
npm run test:cov           # 覆盖率；src/domain/** 语句覆盖必须 >= 90%
```

必须包含的用例（对齐 PRD §11.2）：
`T-01` `T-02`（考期截断，见 §5.1 期望值）、`T-03`（日切）、`T-04`（每日首评）、`T-05`（修正评分，只产生 1 条日志）、`T-07`（撤销逐字段还原）、`T-08`（重现最小间隔）、`T-10`（兄弟卡错开）、`T-11`（每日计划：N=3000, D=60, B=7, M_new=50 → `dailyNew=50` 且 `feasible=false`）、`T-12`（备份往返逐字段一致）。

### 12.3 E2E（核心成功流 + 关键错误流）

```bash
npm run test:e2e           # playwright test，projects: chromium / webkit / mobile-chrome
```

- 成功流：冷启动 → 设置考试日期 → 入门测试 → 学 5 张卡（键盘全流程）→ 提交 → 撤销一次 → 斩词一次 → 导出备份 → 清库 → 导入 → 断言状态一致。
- 错误流：断网（`context.setOffline(true)`）后仍能学习、复习、导出；数据包分块篡改后 `sha256` 校验失败不写缓存并提示（`T-15`）。
- 快捷键流：弹窗打开时按 Space 不揭示；Esc 关闭（`T-13`）。

### 12.4 结构门禁（CI）

```bash
# 单文件 > 300 行（排除空白与注释）即失败
node scripts/check-file-size.mjs --max 300 --dir src
# 入口文件 < 100 行
node scripts/check-entry.mjs src/main.tsx src/App.tsx
# P0：emoji 扫描
node scripts/check-no-emoji.mjs src public
# P0：颜色硬编码扫描
node scripts/check-no-hardcoded-color.mjs src --allow src/styles/theme.css
# P0：图标唯一出口
node scripts/check-icon-imports.mjs src
# db.transaction 只允许出现在 app/transactions.ts
node scripts/check-transaction-boundary.mjs src
```

### 12.5 完成定义

`typecheck` + `lint` + `build` + `test` + `test:e2e` + 六条结构门禁**全绿**，且 PRD §11.2 中标注的用例全部有对应自动化测试，才算本 Spec 交付完成。回归率非零不放行下一阶段。

---

## 13. 本次明确不做（Out-of-Scope）

1. 后端服务、账号体系、云同步（PRD C-01，P2）。
2. AI 助记 / 长难句拆解 / 代理接口（PRD S-03 / §7.3，P1）。
3. 拼写练习（S-01）、点词即查与生词本（S-02）、学习仪表盘（S-04）—— MVP 只预留类型与表，不实现 UI。
4. FSRS 个人参数优化（C-04）；MVP 用 ts-fsrs 内置默认权重（FSRS-6，21 权重）。
5. Easy 评分按钮（Q-07 决定前不加）。
6. 匿名统计上报（Q-06 决定前默认关闭且不上报）。
7. 第二个考试数据包（S-05）。MVP 只发布 `IELTS`。
8. Anki / PDF 导出（C-02）。
9. 任何 UI 组件库、任何第二套图标库、任何 CSS 预处理器。
10. 真题原句（MVP 例句 100% 为仿真例句并标注 ADAPTED）。

---

## 14. 关联决策记录

| ADR | 主题 |
| :-- | :-- |
| `docs/decisions/ADR-001.md` | 前端框架与构建（Vite 8 + React 19 + TS 7 + Tailwind 4） |
| `docs/decisions/ADR-002.md` | 调度引擎 ts-fsrs 与考期适配 |
| `docs/decisions/ADR-003.md` | 本地存储与备份（Dexie + epoch ms + 事务边界） |
| `docs/decisions/ADR-004.md` | 离线与 PWA（vite-plugin-pwa + Workbox） |
| `docs/decisions/OPEN-DECISIONS.md` | 未决项登记 |
