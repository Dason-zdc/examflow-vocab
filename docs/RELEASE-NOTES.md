# 发布说明 — ExamFlow Vocab M1

> 日期：2026-10-21｜状态：**M1 交付候选**（MVP 收口版）
> 需求基线：`docs/01-PRD.md` v0.3｜实现契约：`docs/SPEC.md`｜测试：`docs/04-TEST-PLAN.md`

## 0. v1.6.0 增量（2026-10-22）：US-08 义项级重建

数据包 v1.5.0 → **v1.6.0**，把「词级同义词列表」换成「义项级同义替换」，关闭缺口 G-3 / OD-23。

| 项 | 旧（v1.5.0） | 新（v1.6.0） |
| :-- | :-- | :-- |
| 数据结构 | `Word.synonyms[]`（词级并集） | `Sense.synonymGroups[]`（按 synset 分组） |
| 候选能否说明属于哪个义项 | 否 | 是（4017 组全部带英文释义 + 搭配框架） |
| 可用性判断 | 无 | 五态（可替换 / 框架一致 / 需改写 / 搭配不符 / 待验证） |
| `consist of` | 给 `lie`「躺着」/ `dwell`「居住」，缺 `comprise` | `be composed of` 组：`comprise` 需改写 + `consist of O → comprise O` |
| `consist in` | 与 `consist of` 混在一起 | 独立成组（`frame=in`），候选 `dwell` / `lie` |

- 覆盖：1574/1999 词、2034/2957 义项、4017 个分组、7693 个候选；词级覆盖较旧版 **降 1.2pp**，
  换来义项归属与可用性判断（被过滤掉的是词组、屈折变体、古体拼写与超长词）。
- 新增 ETL `scripts/etl_synonyms.py`（纯标准库，直读 OEWN 2021 SQLite），旧 `enrich_pack_synonyms.mjs` 下线。
- 新增 `SynonymGroups` 区块（`src/ui/SynonymGroups.tsx`）+ 校验约束（`packVerifier` 8 条新断言）。
- 新增测试 22 项（同义区块 7 / 数据包回归 7 / 校验器 8），全量 **234/234 通过**，`npm run check` 6/6，`etl_build_pack.py --verify-only` 与
  `etl_synonyms.py --verify-only` 均通过。
- 裁定与代价见 **`docs/decisions/ADR-006.md`**；质量数据见 **`docs/DATA-QUALITY-SYNONYMS.md`**。
  遗留：PRD 示例 `increase → surge/escalate` 仍不产出（G-5），义项级中文覆盖有限（G-6）。

## 1. 交付范围

首发 **IELTS 2000 词数据包 v1.1.0**（7 个分块，随应用发布首块），PRD 用户故事交付状态：

| US | 用户故事 | 状态 |
| :-- | :-- | :-- |
| US-01 | 学术常考词与义项优先 | 已交付 |
| US-02 | 每日计划与考前可达性 | 已交付 |
| US-03 | 键盘完成一轮学习 | **已交付**（本版补齐 →/Enter/R/F 四键，OD-21 关闭） |
| US-04 | 移动端单手完成学习 | 已交付 |
| US-05 | 形近词对比 | **已交付**（本版补点击跳转词条弹窗，OD-22 关闭） |
| US-06 | 例句点词即查 | 不做（P1，PRD 明确不承诺） |
| US-07 | 备份与恢复 | 已交付 |
| US-08 | 同义替换可达性 | **已交付（v1.6.0 义项级重建，ADR-006；见 §0）** |

关键技术形态：纯静态 PWA（无后端、无运行时 AI）、离线可用、自托管字体、IndexedDB 持久化。
技术栈：Vite 7.3.7 + React 18.3.1 + TS 5.9.3 + Tailwind 3.4.19 + Dexie 4.4.6 + ts-fsrs 5.4.2。

## 2. 质量证据（全部实际运行，2026-10-21）

| 项 | 结果 |
| :-- | :-- |
| `npm test` | **158/158 通过**（19 个测试文件；基线 129 + 本版新增 29：快捷键 14、format 9、ErrorBoundary 3、ExamFlowApp 2、Provider 考期守卫 1） |
| `npm run check` | **6/6 架构门禁通过**（行数 / emoji / 硬编码颜色 / 图标出口 / 事务边界 / 入口装配，违反均为 0） |
| `tsc --noEmit` | 0 错误 |
| `npm run build` | 通过（1990 modules）；SW 预缓存 **20 条目**（503.07 KiB，含自托管 woff2） |
| E2E 冒烟 | **9/9 通过**（`scripts/e2e/smoke.py`，Chromium；报告 `dist-e2e/report.md` + 6 张截图） |
| 数据包校验 | `etl_build_pack.py --verify-only` 通过（含注入脏数据反验证：`kind=REAL` 被精确拦截） |
| 团队合规扫描 | src/ emoji 图标零命中；紫粉渐变产物零命中；AI 模板文案零命中 |

E2E 冒烟覆盖：首页加载与无 console error、manifest 字段、sw.js、SW 注册、7 资源 200、
当日计划面板 + 看答案、移动端 390×844 无横向滚动与 ≥44px 触底、离线 reload 全功能渲染。

## 3. P0-1 事件记录（已关闭，如实披露）

**缺陷**：新用户（或清库后）首次启动 100% 白屏——`ensureSettings` 写入的默认设置 `examDate=''`
在 `ExamFlowApp` 渲染期被无条件传给 `daysToExam`，`parseDay('')` 抛错，React 18 卸载整树。

**发现**：E2E 冒烟首跑（4/9），5 条断言连锁失败。129 项单测未覆盖此 seam（UI 组件无集成测试，
恰是缺口 TG-1/TG-4 的代价）。

**修复**（四点）：`ExamFlowApp` 条件求值走 null 分支；`AppHeader` 改 `number | null`；
`daysToExamLabel` 增「未设置考期」分支；根级 `ErrorBoundary` 纵深防御（重试入口 + 技术细节折叠）。

**复验**：冒烟重跑 9/9；新增 `src/ui/ExamFlowApp.test.tsx` 作为该 seam 的常驻回归；
`StudySessionProvider.start()` 增补考期守卫（空考期保持 idle，不再走 `planDaily` 抛错路径）。

## 4. 已知缺口声明（发版必读）

1. **G-3 / US-08 同义替换**：数据包 `synonyms` 0/2000，UI 未实现。ADR-005 裁定 M1 不做：
   WordNet 同义集义项对齐后覆盖仅 61.6% 且约 20~30% 错配，PRD 标杆示例（increase 对
   surge/escalate/proliferate）无法由同义集产出。P1 以独立 `etl_synonyms.py` 补齐（约 3 人日，
   含抽检 100 词），UI 契约「非空才渲染」约 30 行。
2. **手工验收未全过**：M-4 快捷键全量流程、M-5 备份恢复、M-6 七天提醒、M-8 发音、
   M-9 iOS Safari 真机、M-10 旧包升级仍需人工执行（M-1/M-2/M-3/M-7 已有 E2E 子集覆盖，
   真机安装弹窗与 iOS 行为不在冒烟范围）。
3. **测试缺口**：TG-1（CardBack / WordPreviewModal / SettingsModal 渲染细节无单测）、
   TG-2（useExamFlow 完整编排无集成测试）、TG-3（T-19 不扫 JSX 裸文本节点，现文案全走字面量）。
4. **快捷键 S 键**（拼写）为 P1 剔除项，无动作是既定口径（D-07）。

## 5. P1 路线图（按优先级）

| 项 | 内容 | 依据 |
| :-- | :-- | :-- |
| 同义词数据管线 | WordNet + enDef 义项对齐 + 黑名单 + 抽检；UI「非空才渲染」 | ADR-005 |
| React 19 / Tailwind 4 升级 | 独立批次 C，需设计师参与令牌迁移；OD-01/OD-02 在案 | 02-ARCH §0.4 |
| 词族记忆模块（可选） | 词根相关词独立卡片模块（993/2000 覆盖），不得冒充同义词 | devops 调研方向 4 |
| 目录重构 | domain 拆 day/cardFactory/undo 等纯物理拆分，无行为变化 | frontend 提案，列批次 D |
| S 键拼写 | 快捷键补位 | D-07 |

## 6. 数据包与合规

- 词条来源：ECDICT（MIT）、lemma.en.txt（研究/教育用途声明）、wordroot.txt；学术词表仅用于排序加权。
- **所有例句均为仿真例句**（`provenance.type = 'ADAPTED'`），不含也不声称来自任何受版权保护的考试材料。
- **义项权重为公开信号合成的估计值**：`kind` 恒 `'ESTIMATED'`，`senseWeight` 仅用于学习优先级排序；
  产品无雅思真题语料，不存在也不允许「真题/历年/考频/出现次数」类表述（T-19 门禁自动扫描，
  注入探针验证过可拦截）。
- `synonyms` 字段留空待 P1（ADR-005）；词根说明仅在 ECDICT wordroot.txt 明确收录时生成，不做推测。
- IELTS 为剑桥大学出版社、British Council 与 IDP 的注册商标；本数据包为独立编制的学习材料。

## 7. 部署

```bash
npm install && npm run build   # 产物 dist/，任何静态托管均可（HTTPS）
```

注意：SW 校验路径依赖安全上下文（HTTPS 或 localhost）；局域网真机调试需 HTTPS 或
Chrome `#unsafely-treat-insecure-origin-as-secure`。
