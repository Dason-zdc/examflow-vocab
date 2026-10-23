# ExamFlow Vocab — 测试计划（Test Plan）

> 角色：team-lead（测试契约）
> 日期：2026-10-21
> 状态：**254 项自动化用例全绿**（40 个文件），6/6 架构门禁通过，tsc 0 错误，E2E 冒烟 9/9（`scripts/e2e/smoke.py`，TG-4 已闭环）。
> 增量：2026-10-22 义项级同义 +22 例、2026-10-23 全量词典 +20 例；§2 的逐文件清单保留 2026-10-21 基线，增量见 §8。
> 上游：`docs/01-PRD.md` 各 US 的 AC；`docs/SPEC.md` §10/§11。

---

## 1. 策略与分层

| 层 | 对象 | 工具 / 环境 | 用例数 | 文件 |
| :-- | :-- | :-- | --: | :-- |
| L1 领域纯函数 | planner / scheduler / sessionQueue / reviewCommitter / clock | vitest（node） | 56 | `src/domain/*.test.ts` |
| L2 数据与存储 | packVerifier / packLoader / dictionary / db / backupService | vitest + fake-indexeddb | 47 | `src/content/*.test.ts`、`src/storage/*.test.ts` |
| L3 app 用例 + UI 组件 | sessionBuilder / onboarding / review / 全流程 Provider / 快捷键 / 格式化 / 错误边界 / 首屏回归 | vitest + fake-indexeddb + jsdom + @testing-library/react | 53 | `src/app/*.test.{ts,tsx}`、`src/ui/*.test.{ts,tsx}` |
| L4 合规门禁 | T-19 禁用表述扫描 + 权重口径 | vitest（node，源码扫描） | 2 | `src/test/complianceScan.test.ts` |
| L5 架构门禁 | 6 项静态规则 + 数据包交付校验 | `npm run check`（node 脚本）+ `etl_build_pack.py --verify-only` | 6 规则 | `scripts/check-*.mjs` |
| L6 手工验收 | PWA / 离线 / 真机 | 人工（§6 矩阵） | — | — |

运行方式：

```bash
npm test           # L1–L4 + UI 组件全量（vitest run）
npm run check      # L5 六门禁
npm run typecheck  # tsc --noEmit（强类型也是测试）
npm run build      # 构建即 PWA 产物验证
python scripts/etl_build_pack.py --verify-only   # 数据包交付校验（2026-10-21 修复旧 Schema 漂移后通过）
python scripts/e2e/smoke.py   # L6 E2E 冒烟（先 npm run build；产物 dist-e2e/，SMOKE-01~09）
```

**环境契约**：`vite.config.ts` 的 `test.include` 必须覆盖 `src/**/*.test.{ts,tsx}`；
Provider 测试文件头 `// @vitest-environment jsdom`；存储测试依赖 `fake-indexeddb/auto`。
（历史教训：include 只写 `.ts` 时 `.tsx` 测试静息不跑，曾使 Provider 全流程测试长期缺席。）

## 2. 用例清单（2026-10-21 基线：19 文件 / 158 用例）

### L1 domain（56）

**`src/domain/clock.test.ts`（7）**：日切归属 / dayStartHour=0 / 时钟注入 / studyDayStart /
距考天数 / 考试已过 / 非法输入抛错。

**`src/domain/planner.test.ts`（13）**：T-11 N=3000/D=60/B=7/M=50 → n_new=50 + CANNOT_FINISH /
min 取小 / D≤21 窗口自适应 / 过轮窗口判定 / 窗口内停新卡（手动开启除外）/ 0 值与上限 0 /
优先级公式 / 同 R 层级决胜 / M_rev 顺延与积压 / 暂停卡与 EXAM_PAST /
T-10 同词当日 1 张 / 新卡阶段优先主义项 / studiedWordIds 顺延。

**`src/domain/scheduler.test.ts`（13）**：T-01 D=10 截断 ≤9 天 / T-02 D=1 恰 1 天 /
截断下界恒 1 / 原始间隔小则不扰 / 新卡无亚日级 due / 三档评分映射 /
retention 与上限随考期收紧 / 主义项+僻义 ≤3 张 / 无僻义只建 1 张 /
无考频数据不建卡 / 每日首评判定 / T-03 日切前后各一次均入 FSRS / 斩词与恢复。

**`src/domain/sessionQueue.test.ts`（13）**：首现即通关 / 不认识置 0 重排 /
模糊置 1 且 ≥2 通关 / 一次认识只到 1 / T-08 剩 2 张时不连续出现 /
待巩固卡错峰 / 重排间隔取「≥3 张」与「60 秒」更靠后者 / 耗时估计自修正 /
非正耗时忽略 / T-09 清空即结束不拉未到期卡 / 小结区分通关与待巩固 /
只许评当前卡 / 快照往返一致。

**`src/domain/reviewCommitter.test.ts`（10）**：T-04 同日 Again/Good/Good 只一次入 FSRS /
跨日再首评 / T-05 预判修正只 1 条日志 corrected=true / 未变不算修正（改回仍算）/
pending 不匹配拒提交 / T-07 撤销逐字段还原 + 首评日回退 / 同日重现撤销不清空 /
缺快照明确报错 / SessionUndo 单层（评审 + 斩词）/ 斩词不动调度器。

### L2 content + storage（47）

**`src/content/packVerifier.test.ts`（15）**：manifest 合法 / sha256 必须 64 位 /
缺 exam/version/chunks 拒 / chunk 合法 / chunk 与 manifest 一致性 / wordCount 一致性 /
**provenance 必须 ADAPTED** / **kind 必须 ESTIMATED** / **sources 非空** /
tier 合法值 / 例句关联真实义项 / 每词至少一个考试统计 / lemma-map 长度 /
与 node:crypto 一致 / ArrayBuffer 与 Uint8Array 一致。

**`src/content/packLoader.test.ts`（7）**：首次走网络 + sha256 过检入缓存 /
二次全缓存零网络 / 篡改字节校验失败并明确报错 / manifest 失败回落离线缓存 /
离线无缓存抛原始错误 / onProgress 覆盖每一步 / deprecated 词过滤。

**`src/content/dictionary.test.ts`（13）**：lemma-map 还原 / 原形命中 / 大小写不敏感 /
未收录返回 null / **getWord 按数据包 ID**（回归：曾因只按 lemma 查导致队列全空）/
getWord 回落 lemma / lookup / 搜索前缀优先 / 中文释义命中 / 空查询 / limit /
browse 降序 / wordsForExam 过滤。

**`src/storage/db.test.ts`（6）**：分表与复合索引 / 进出库只多 dueAt /
Card+ReviewLog 同事务（失败整体回滚）/ settings 单条覆盖 / 首次打开写 schemaVersion /
不重复迁移 + 持久化探测。

**`src/storage/backupService.test.ts`（6）**：Date 往返不退化 / last_review undefined→null /
拒绝错格式缺字段高版本 / 导出→清空→导入逐字段一致 / 导入前自动导出当前数据 /
merge 模式后写覆盖不删本地。

### L3 app + UI 组件（53）

**`src/app/sessionBuilder.test.ts`（9）**：到期按优先级 + 新卡按权重 + 上限 /
maxNewPerDay 绑定（考期拉近使上限成为约束）/ 兄弟卡错开 / studiedWordIds /
暂停卡排除 / 异考试卡排除 / 词条缺失跳过不炸 / 空队列无警告 / tier 缺失按 EXTENDED。

**`src/app/onboardingUseCase.test.ts`（6）**：主义项+僻义建卡 / excludeBasic /
幂等补缺 / batchSize=2 全落库 / ensureSettings 首次写不覆盖 / activateExam 切换并补建。

**`src/app/reviewUseCase.test.ts`（4）**：提交原子落库 + 首评日推进 /
同日第二次 sessionOnly 不推 FSRS / 撤销还原 + 删日志 / 撤销不匹配报错。

**`src/app/StudySessionProvider.test.tsx`（6）**：开始→预判→揭示→修正→提交→撤销全链路
（含 DB 断言：1 条日志、corrected/prejudged、撤销后 reps=0、首评日回空）/
未预判默认 GOOD 且 prejudged=false / 队列走完进小结统计 / 空队列直接空小结 /
词书未就绪报错 / **考期未设置时 start() 保持 idle 不报错**（契约：不 dispatch，
设置保存后由 Chrome revision 效果重启；回归自 P0-1 白屏事件的根因链）。

**`src/ui/ExamFlowApp.test.tsx`（2）**：**P0-1 回归——examDate 为空串时渲染引导而非
抛错卸载整树**（fake-indexeddb + mock packLoader + 预置空考期设置行；断言渲染不抛错、
「先设置考试日期」heading、「未设置考期」chip、无「距考试 null」）/
daysToExamLabel 对 null 走独立分支。

**`src/ui/useStudyHotkeys.test.tsx`（14）**：G-1/TG-1 组件级回归——Space 揭示→next 分流 /
→/Enter/Space 同一 handler / 1/2/3 映射 / R/r+F/f 折叠 / C 与 Shift+C 传参 / X/Z /
**按键让位口径**（INPUT/TEXTAREA 全量屏蔽且移出恢复；BUTTON 焦点下 Space/Enter 不分发
保留原生激活，而 1/→/r 等照常分发，防鼠标点击毒化键盘流）/ 修饰键不触发 /
enabled=false 不挂监听。

**`src/ui/format.test.ts`（9）**：daysToExamLabel 全分支（null / 负数 / 0 / 正数）/
weightLabel 恒「估计」口径 / TIER_LABEL / RATING_LABEL / BACK_RATING_LABEL /
statStrip / stateLabel / kindLabel / formatDueLabel / formatMonthDay。

**`src/ui/ErrorBoundary.test.tsx`（3）**：render 期抛错渲染 role=alert 兜底 /
点重试恢复子树 / 正常子组件直通。

### L4 合规（2）

**`src/test/complianceScan.test.ts`（2）**：T-19 违禁措辞扫描（`真题 / 历年 / 考频 / 原题 /
考试统计 / 出现次数…`，只扫字符串字面量，注释不算文案）/ 权重文案恒「估计权重」。
**已验证可拦截**：注入探针 `'这是真题出现次数'` 后测试失败并给出文件与命中词，移除后恢复通过。

## 3. AC 覆盖矩阵（PRD §4）

| US | AC | 自动化覆盖 | 位置 |
| :-- | :-- | :-- | :-- |
| US-01 | AC-01.1 权重降序 | 覆盖 | sessionBuilder「新卡按权重追加」+ dictionary |
| | AC-01.2 权重条+徽章+估计口径 | 口径覆盖 / UI 靠手工 M-4 | complianceScan + format.weightLabel |
| | AC-01.3 熟词僻义独立卡 | 覆盖 | scheduler「主义项+僻义」+ onboarding |
| | AC-01.4 排除基础词开关重算 | 覆盖 | onboarding（excludeBasic）+ planner（实时重算） |
| US-02 | AC-02.1 计划与上限展示 | 逻辑覆盖 / UI 手工 | planner + DailyPlanPanel（M-3） |
| | AC-02.2 CANNOT_FINISH | 覆盖 | planner T-11 |
| | AC-02.3 D=10 截断 | 覆盖 | scheduler T-01 |
| | AC-02.4 D=1 | 覆盖 | scheduler T-02 |
| | AC-02.5 过轮窗口 | 覆盖 | planner（窗口判定 + 停新卡） |
| US-03 | AC-03.1 快捷键子集 | 覆盖 | useStudyHotkeys 14 例（键位映射 / 屏蔽口径 / 按键让位） |
| | AC-03.2 输入框屏蔽 | 覆盖 | useStudyHotkeys（INPUT/TEXTAREA 全量屏蔽 + 移出恢复） |
| | AC-03.3 Esc + 焦点陷阱 | 手工 | SettingsModal |
| | AC-03.4 S 键无动作 | 覆盖（实现即无 case） | useStudyHotkeys |
| US-04 | AC-04.1 44px + safe-area | 手工 + 令牌 | primitives min-h-11 / `--touch-min` |
| | AC-04.2 不禁缩放 | 覆盖 | index.html viewport 无 user-scalable=no |
| | AC-04.3 次要模块折叠 | 覆盖（实现默认折叠） | CardBack 折叠块 |
| US-05 | AC-05.1 形近词展示 | 手工 | CardBack ConfusableBlock |
| | AC-05.2 点击跳转 | 交付完成 | WordPreviewModal + ConfusableBlock 可点击；渲染细节靠 E2E + 手工（TG-1） |
| US-06 | AC-06.1 例句点词即查 | 覆盖 | `StudyFeatures.test.tsx`（点词 → 弹窗 → 加入生词本）+ `LookupModal` 词典兜底 |
| | AC-06.2 词形还原 | 覆盖 | `dictionary.test.ts` + `dict.test.ts`（不规则 / 后缀 / 不猜词） |
| US-07 | AC-07.1 导出字段 | 覆盖 | backupService 导出 + validate |
| | AC-07.2 导入逐字段一致 | 覆盖 | backupService「导出→清空→导入」 |
| | AC-07.3 7 天提醒 | 手工 | BackupPanel |
| | AC-07.4 persist + iOS 引导 | 手工 | useExamFlow / SettingsModal |
| US-08 | AC-08.1 按义项展示同义替换 | 覆盖 | `SynonymGroups.test.tsx`（7）+ `synonymPack.test.ts`（7，含 consist 标杆与中文绑定） |
| | AC-08.2 例句可替换关系 | 部分（不单独高亮替换词） | 例句与义项绑定由数据包 `senseId` 保证；替换高亮未做，见 G-5 |
| | AC-08.3 无数据不渲染 | 覆盖（改为该分区一行说明） | `SynonymGroups.test.tsx` 空态用例 |
| 词典（ADR-007） | 任意词可查 / 分片加载 / 离线缓存 | 覆盖 | `dict.test.ts`（13）、`DictLookup.test.tsx`（4）、`DictView.test.tsx`（3）；结构校验 `build_dict.py --verify-only`，覆盖校验 `--check-coverage` |

图例：**覆盖** = 自动化用例断言｜**逻辑覆盖 / UI 手工** = 逻辑有测试、渲染靠人工｜
**部分** = 部分子项有自动化｜**未交付** = 缺口登记在案｜**范围外** = PRD 明确不做。

## 4. T-19 合规门禁（PRD §12.4，已落地为 CI 阻断项）

- **扫描器**：`src/test/complianceScan.test.ts`，遍历 `src/**/*.{ts,tsx}`（排除测试文件），
  单遍词法分析剥离注释后收集字符串字面量，命中违禁词即失败
- **违禁词表**：`真题 / 历年 / 考频 / 原题 / 考试统计 / 出现次数 / 出现 N 次 / 出现几次`
- **数据侧三重断言**（packVerifier）：`provenance.type === 'ADAPTED'`、
  `kind === 'ESTIMATED'`、`sources` 非空——三者任一不满足，数据包拒绝加载
- **UI 口径**：`format.weightLabel` 恒输出「估计权重 N」；CardBack 权重条脚注明
  「公开信号合成的估计值…不是考试出现次数」
- **拦截验证记录**：2026-10-21 注入探针确认失败并定位，移除后恢复（见 §2 L4）

## 5. 手工验收矩阵（自动化不覆盖，发版前必过）

| # | 场景 | 步骤 | 期望 | E2E 覆盖 |
| :-- | :-- | :-- | :-- | :-- |
| M-1 | PWA 可安装 | Chrome 地址栏安装图标 → 安装 | standalone 窗口，图标为品牌标（any/maskable 均不裁切） | 已由 E2E 冒烟覆盖（scripts/e2e/smoke.py，报告 dist-e2e/report.md） |
| M-2 | 离线可用 | 装后断网 → 打开 → 学 5 张 | 全部功能可用；SW 预缓存 20 条目 | 已由 E2E 冒烟覆盖（scripts/e2e/smoke.py，报告 dist-e2e/report.md） |
| M-3 | 当日计划 | 设置考期 → 回首页 | n_new / M_rev / 覆盖率 / 警告与 planner 输出一致 | 已由 E2E 冒烟覆盖（scripts/e2e/smoke.py，报告 dist-e2e/report.md） |
| M-4 | 学习一轮 | 键盘 Space→1/2/3→C→X→Z 各一次 | 行为与 HotkeyPanel 口径一致；斩词后可恢复 | — |
| M-5 | 备份恢复 | 导出 → 清 IndexedDB → 导入 | 进度、星标、笔记、日志逐字段还原 | — |
| M-6 | 7 天提醒 | 改 lastBackupAt 为 8 天前 → 进首页 | 出现一次性提醒，关闭后本周期不再出 | — |
| M-7 | 移动端 | DevTools iPhone 视口 <768px | 底部操作区可达，按钮 ≥44px，无横向滚动 | 已由 E2E 冒烟覆盖（scripts/e2e/smoke.py，报告 dist-e2e/report.md） |
| M-8 | 发音 | 点发音 / 按 C / Shift+C | en-GB / en-US 切换；不支持时静默降级不报错 | — |
| M-9 | iOS Safari | 添加到主屏幕 → 离线打开 | 引导文案出现；数据不丢 | — |
| M-10 | 旧包升级 | 换低 version 数据包 → 刷新 | 明确拒绝并提示，不白屏 | — |

**E2E 覆盖边界**（2026-10-21 由 QA-2 落地，TG-4 闭环；首跑抓出并修复 P0-1：
新用户首屏白屏——`ExamFlowApp.tsx` 对空 `examDate` 无条件求值 `daysToExam` 触发
`parseDay('')` 抛错卸载 React 树，已由前端修复并补 ErrorBoundary 与回归测试）：

- M-1：覆盖 manifest 字段（name/short_name/theme_color/background_color/display/icons×4）、
  `/sw.js` 可访问、SW 注册且 active；真机安装弹窗与 maskable 裁切仍待人工。
- M-2：简化版——在线加载后断网 reload，学习卡完整渲染（SW navigateFallback +
  IndexedDB 数据包缓存生效）、无 pageerror/应用级 console error；
  「学 5 张」完整离线流程仍待人工。
- M-3：覆盖计划面板展示层（新卡/复习数值、上限、核心考点覆盖率、考试日 caption）；
  与 planner 输出的逐项数值一致性仍待人工核对。
- M-7：覆盖 390×844 视口无横向滚动、底部操作区在视口内且按钮高度 ≥44px
  （实测 48/48/48/44px）；真机触感仍待人工。

## 6. 测试缺口（登记在案）

| # | 缺口 | 计划 |
| :-- | :-- | :-- |
| TG-1 | ui 组件级单测覆盖不全（useStudyHotkeys / format / ErrorBoundary / ExamFlowApp 已补） | 剩余 CardBack / WordPreviewModal / SettingsModal 等渲染细节无单测，E2E + 手工兜底；按需补 |
| TG-2 | useExamFlow 数据编排无完整集成测试（ExamFlowApp.test.tsx 已覆盖首屏 seam） | P1：fake-indexeddb + mock packLoader 的完整编排测试（加载→建卡→设置→重排） |
| TG-3 | T-19 只扫字符串字面量，JSX 文本节点（如 `>非真题<` 形式）不在范围 | 现文案已全部走字面量；若引入 JSX 裸文本需扩展扫描器 |
| TG-4 | 已闭环（2026-10-21）：scripts/e2e/smoke.py，SMOKE-01~09，9/9 PASS | 剩余 M-4 全量快捷键 / M-5 / M-6 / M-8 / M-9 / M-10 未自动化；真机安装与 iOS 仍需人工 |

## 7. 退出准则（发版门）

- [x] `npm test` 254/254 通过（40 文件；含 P0-1 回归 ExamFlowApp.test.tsx、快捷键 14 例、同义 22 例、词典 20 例）
- [x] `npm run check` 6/6 通过
- [x] `npm run typecheck` 0 错误
- [x] `npm run build` 成功且 SW 预缓存 20 条目
- [x] `python scripts/etl_build_pack.py --verify-only` 通过（含注入脏数据反验证：`kind=REAL` 被精确拦截）
- [x] `python scripts/etl_synonyms.py --verify-only` 与 `build_dict.py --verify-only` 通过；`build_dict.py --check-coverage` 覆盖 6005/6006（缺 `swosh`，ECDICT 无词条）
- [x] E2E 冒烟 9/9 通过（scripts/e2e/smoke.py，报告 dist-e2e/report.md；覆盖 M-1/M-2/M-3/M-7 可自动化子集）
- [ ] §5 手工矩阵 M-1 ~ M-10 全过（需真机 / 浏览器人工执行；M-1/M-2/M-3/M-7 已有 E2E 子集覆盖）
- [x] 已知缺口在发布说明中显式声明（G-1/G-2/G-3 已闭环；当前剩 G-5 标杆示例、G-6 义项级中文覆盖、G-7 词典只有词级中文）——见 `docs/RELEASE-NOTES.md`

## 8. 增量用例（2026-10-22 / 10-23）

| 文件 | 用例数 | 覆盖 |
| :-- | --: | :-- |
| `src/ui/SynonymGroups.test.tsx` | 7 | 义项分组渲染 / 五态徽章 / 改写模板 / 库内外候选均可点 / 空态 |
| `src/content/synonymPack.test.ts` | 7 | 数据包回归：`consist of` 必产出 `comprise`、`consist in` 不串组、候选中文绑定义项 |
| `src/content/packVerifier.test.ts`（新增 8 条） | 8 | 义项级同义约束：synset / gloss / 五态 / 非本词 / 改写模板 / 冲突理由 / 中文不得多义合并 |
| `src/content/dict.test.ts` | 13 | 精确查词 / 不规则变形 / 跨字母变形 / 后缀还原 / 查不到返回 null / 前缀搜索 / 分片浏览 / manifest 失败降级 / sha256 拒绝 / 释义切行 |
| `src/ui/DictLookup.test.tsx` | 4 | 弹窗未收录时回落词典 / 两边都没有才提示 / 词典释义带入自定义词条 / 库外候选可点 |
| `src/ui/DictView.test.tsx` | 3 | A–Z 浏览与切分片 / 详情与加入生词本 / 词包内词不重复加入 |
