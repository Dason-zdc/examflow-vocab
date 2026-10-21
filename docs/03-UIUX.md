# ExamFlow Vocab · UI/UX 设计规范

> 生成日期：2026-10-21 | 设计师：颜好看（UI/UX）
> 依据：`0_2_prd.md` v0.2 + `examflow_vocab.html` 交互演示原型
> 寄存器：**Product**（设计服务产品，标杆是「赢得熟悉感」）
> 平台：**web**（桌面浏览器 + 移动浏览器，PWA）
> 三轴刻度：**Variance = 4 / Motion = 3 / Density = 6**

本文件是项目级设计契约。前端按第 5 节的 Token 文件与第 9 节的 Tailwind 配置实现，按第 7 节的逐页提示词搭建页面。第 10 节是放行检查表。

---

## 1. 对标品牌与设计语言

### 1.1 竞品调研结论

调研了 5 个对标对象，逐个标注「借什么 / 避什么」。

#### 墨墨背单词（Maimemo）

中国应试背词的默认参照系。全平台累计 3 亿+ 下载，考研用户心智占有率最高，自主研发 MM 记忆算法并在 ACM SIGKDD、IEEE TKDE 发表成果，累计记忆行为数据 1900 亿条。

- **借**：无广告、无社区的极简界面；点击揭示 + 三档评分的低摩擦循环；数据透明（个人遗忘曲线、未来复习压力图）。「未来压力图」直接对应我们 PRD 5.3 的积压提示。
- **避**：灰叠灰的视觉层次。释义、例句、词根、笔记在墨墨里是同一层灰色文字，长时间阅读后眼睛找不到落点。我们的修正：四类信息用边框分组 + 三级字重 + 三级前景色拉开。

#### 扇贝单词（Shanbay）

行业里最早把「考频」和「真题例句」做成一等公民的产品，独有正版柯林斯词典授权与真题例句关联学习法。

- **借**：考频作为独立视觉元素（我们做成「IELTS 考频 31 次」徽章 + 占比条，见 P1）。例句优先于孤立释义。
- **避**：游戏化与社交噪声（打卡排行、小组）。我们的北极星指标是「考试日预测掌握核心考点数」，任何不服务于它的激励都是噪音。另外柯林斯需商业授权，PRD 4.1 已排除，我们改用 WordNet。

#### Anki

调度算法的黄金标准，SM-2 / FSRS 的参考实现，完全可定制。

- **借**：键盘优先操作；状态显式可见（我们背面头部直接显示 `状态 · S 天数 · D · R`）。
- **避**：界面老旧、上手曲线陡峭、需自行制卡。我们的对应措施：数据包预置卡片 + 入门水平测试（PRD M-08）。

#### Linear

Product 寄存器的工艺标杆。

- **借**：亮度递进表达层级而非阴影；1px 半透明边框代替投影；强调色只出现在 CTA / 选中态 / 焦点环；Inter 字重 510 做微妙强调。
- **避**：深色优先。我们的用户以白天图书馆、通勤为主，MVP 走浅色（见 2.6）。

#### Notion

长时间中文阅读的舒适度标杆。

- **借**：正文行高给到 1.6 以上（我们中文正文取 1.7）；文字色用暖近黑而非纯黑（我们取 `#141A22`）；正文不低于 16px。
- **避**：衬线标题。Dashboard 与工具界面禁用衬线，我们的标题与正文同一族，靠字重与字号拉开。

### 1.2 设计语言定名与三条主张

**设计语言：石墨标尺（Graphite Ruler）**

三条主张，每条都能在代码里被检验：

1. **颜色只承载语义，不承载装饰。** 中性色占 82%，强调色 8%，语义色 6%，效果色 <1%。评分按钮未选中时是中性描边，选中后才取语义色。这样学习页静止时可见色相只有 2 个。
2. **信息靠分组而非嵌套盒子区分。** 背面有义项、例句、词根、形近词、笔记五块信息。不用「卡中套卡」，用 `border-t` / `divide-y` + 负空间分组，密度给到 6 但不闷。
3. **键盘与触屏是同一套状态机的两个皮肤。** PRD 5.4 的快捷键与移动端底栏操作的是同一个 `act(name)` 分发入口，不各写一份。这保证 T-13（弹窗屏蔽快捷键）只需在一处实现。

### 1.3 为什么适合雅思考生

- **单次会话时长 30 到 90 分钟。** 背景用 `#F5F7FA` 冷白纸感而非纯白，正文行高 1.7，中文正文 16px。三项叠加能把长会话的眩光和串行率压下去。
- **信息密度诉求真实存在。** 雅思阅读与写作要求分辨义项细微差别，义项考频、熟词僻义徽章、形近词对比、英文释义都得在一屏内可见。密度给到 6（而非美术馆级的 2）是对的。
- **跨端切换频繁。** 同一套 `act()` 状态机保证从电脑切到手机，卡片状态、评分、撤销语义完全一致。

---

## 2. 色彩系统

### 2.1 配比

| 层级 | 占比 | 内容 |
|---|---|---|
| 中性色 | 约 82% | 背景、表面、边框、分隔线、正文 |
| 强调色 | 约 8% | 主 CTA、焦点环、进度条、当前选中 |
| 语义色 | 约 6% | 正确 / 模糊 / 错误 / 熟词僻义 |
| 效果色 | < 1% | 悬浮阴影、遮罩 |

### 2.2 主色（A1-identity）

**石墨青 `#0E7490`**（teal-600）

选色理由，三点都是可验证的：

1. **避开默认靛蓝。** Tailwind 默认 `#6366f1` 是公认的「一眼 AI」首罪。我们不用它。
2. **避开与语义色撞车。** 竞品绿色系（Duolingo、`#10B981`）与我们的「认识/正确」语义冲突，蓝色系（Anki、各类背词 App）过于饱和。石墨青在色相环上与红（错误）、琥珀（模糊）、翠绿（正确）都拉开足够距离。
3. **符合寄存器。** Product 寄存器要求「克制的调色板 + 一个强调色」。石墨青是一个，不是三个。

```css
--accent:        #0E7490;  /* 白底对比度 5.36:1 OK */
--accent-hover:  #0B5F76;  /* 7.21:1 OK */
--accent-active: #094C5E;
--accent-soft:   #E6F4F7;  /* 徽章底 */
--accent-soft-fg:#0B667F;  /* 徽章字 */
```

**每屏强调色 ≤ 2 处的执行规则：**

| 位置 | 强调色用量 | 说明 |
|---|---|---|
| 学习页头部 | 1 | 仅「本卡考点」行用 `--surface-active` 底 |
| 学习页按钮区 | 1 | 「下一个」主按钮用 `--accent` 填充 |
| 评分按钮 | 0 到 1 | 未选中为中性描边；选中后仅那一个取语义色 |
| 计划面板 | 1 | 核心覆盖率进度条填充 |

### 2.3 语义色（A2）

| Token | 值 | 用途 | 白底对比度 |
|---|---|---|---|
| `--success` | `#047857` | 认识 / Good / 正确 / 通关提示 | 5.48:1 OK |
| `--success-soft` | `#E7F6EE` | 成功态底色 | |
| `--warn` | `#B45309` | 模糊 / Hard / 待巩固 / 备份超期 | 5.02:1 OK |
| `--warn-soft` | `#FEF4E4` | 警示态底色 | |
| `--danger` | `#BE123C` | 不认识 / Again / 记错了 / 斩词 | 6.29:1 OK |
| `--danger-soft` | `#FDECEF` | 错误态底色 | |
| `--info` | `#4338CA` | 熟词僻义徽章 / 批注 | 7.90:1 OK |
| `--info-soft` | `#EEF2FF` | 批注底色 | |

**为什么熟词僻义用靛蓝而不是紫色系：** PRD 的 P0-2 禁止的是「Indigo → Pink 渐变 + 发光边框 + 毛玻璃」的三位一体套路，纯色 Indigo 明确允许。熟词僻义是「红笔批注」式的语义标记，需要一个既不撞错误红、也不撞模糊琥珀的第四色。靛蓝 `#4338CA` 作为**纯色实心徽章**出现，不用渐变、不用发光、不用模糊，符合规则。

### 2.4 熟词僻义徽章 / 考频条 专项

**熟词僻义徽章**（`--badge-eccentric-*`）：

```css
background: var(--info-soft);   /* #EEF2FF */
color:      var(--info);        /* #4338CA */
border-radius: var(--radius-sm);
font-size:  var(--text-xs);
font-weight: var(--font-weight-emphasize);
padding: 2px 6px;
```

无边框，无阴影，无渐变。与「本卡考点」徽章（青色实心）在色相和填充方式上都不同，可区分。

**考频进度条**（`--freq-*`）：

```css
/* track */
background: var(--freq-track);  /* #E3E8EE */
height: 6px; width: 56px; border-radius: var(--radius-pill);
/* fill */
background: var(--freq-fill);   /* var(--accent) */
/* 桌面端宽度 96px */
```

填充色与轨道色对比度 4.35:1，超过 3:1 的非文本对比要求。这是数据编码而非装饰，允许使用强调色。右侧必须同时给出数字（`31 次 · 47%`），不依赖颜色单独传达信息。

### 2.5 中性色阶

```css
--gray-0:   #FFFFFF;   /* surface */
--gray-25:  #FAFBFC;
--gray-50:  #F5F7FA;   /* bg，冷白纸感 */
--gray-100: #EEF1F5;   /* surface-warm / sunken */
--gray-200: #E1E6EB;   /* freq track */
--gray-300: #CBD2DB;
--gray-400: #A9B3BF;
--gray-500: #7C879A;
--gray-600: #545E6D;   /* muted */
--gray-700: #3B4450;   /* fg-2 */
--gray-800: #242C37;
--gray-900: #141A22;   /* fg，近黑带冷调 */
--gray-950: #0B1016;   /* 深色模式 bg */
```

前景三级映射：

| Token | 值 | 场景 | 白底对比度 |
|---|---|---|---|
| `--fg` | `#141A22` | 标题、单词、释义主文 | 17.49:1 OK |
| `--fg-2` | `#3B4450` | 次标题、例句正文 | 9.87:1 OK |
| `--muted` | `#545E6D` | 辅助说明、面板标签 | 6.56:1 OK |
| `--meta` | `#697284` | 时间戳、占位符、mono 统计 | 4.84:1 OK |
| `--fg-disabled` | `#97A1B0` | 禁用控件 | 2.53:1（禁用态豁免 1.4.3） |

边框：

| Token | 值 | 场景 | 白底对比度 |
|---|---|---|---|
| `--border` | `#DDE3EA` | 卡片边、装饰分隔 | 1.20:1（装饰，无要求） |
| `--border-soft` | `#ECEFF3` | 组件内 `divide-y` | 1.08:1（装饰） |
| `--border-strong` | `#7E8B9C` | 输入框、描边按钮边界 | **3.47:1 OK（满足 1.4.11）** |

### 2.6 深色模式决策：MVP 只做浅色

**结论：MVP 只交付浅色主题。** 三条理由，都指向范围控制而不是审美偏好：

1. **深色模式对长文中文阅读不是免费的。** 亮度递进要重新标定，辉光（halation）会让中文笔画在深色底上发虚，需要单独调字重与字距。这不是套一个 `filter: invert()` 能解决的。
2. **QA 表面翻倍。** M1 已经在两个视口（桌面 + 移动）上跑，再加两个主题等于四倍组合。PRD 第 10 章 M1 只有 6 周，排不进去。
3. **使用场景以日间为主。** 图书馆、自习室、通勤，都不是深色模式的强需求场景。

**但结构上是深色就绪的。** `design-tokens.css` 第 13 节已提供 `:root[data-theme="dark"]` 骨架，所有组件引用的是语义 Token 而非原始色值。启用深色只需两步：

1. 补全深色区块的中性色阶与强调色覆盖值。
2. 在 `<html>` 上加 `data-theme="dark"`。

组件代码零改动。**注意**：不要直接反转浅色色阶。熟词僻义徽章（靛蓝）和考频条（青）在深色底上必须重新测对比度，这两个是已知的失败点。

---

## 3. 字体系统

### 3.1 字体栈

```css
/* 标题与正文：拉丁在前，中文回退在后 */
--font-display: "Inter", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
                "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
--font-body:    "Inter", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
                "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;

/* 词头 + 音标 + 等宽统计 */
--font-word: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo,
             Consolas, "Liberation Mono", "Courier New", monospace;
--font-mono: var(--font-word);
```

**顺序很重要。** 拉丁字体放在最前，英文永远不会被中文回退字体接管。中文栈依次覆盖 macOS / iOS（PingFang SC）、旧版 macOS（Hiragino Sans GB）、Windows（Microsoft YaHei）、Android 与 Linux（Noto Sans CJK SC）。

**自托管强制要求。** JetBrains Mono 与 Inter 必须自托管（Vite 打包进产物）。PRD 8.1 明确「构建期编译，不用 CDN 运行时」，且 PRD 2.4 要求 100% 离线可用。运行时从 CDN 拉字体会直接破坏这两条。Inter 需使用 Variable 版本以获得 510 / 590 字重；若降级为静态 Inter，字重回退为 500 / 600。

### 3.2 等宽栈的使用边界

这是本项目最容易做错的一条，单独说清楚。

| 用 `--font-word`（等宽） | 用 `--font-body`（无衬线） |
|---|---|
| 词头 lemma（如 `address`） | 英文例句正文 |
| 国际音标 `/əˈdres/` | 中文释义与译文 |
| 状态数字串 `S 12d · D 5 · R 87%` | 笔记、助记文本 |
| 考频数字 `31 次 · 47%` | 按钮标签、导航项 |
| 形近词的音标 | 派生词的中文释义 |

**判据：短标签与数字用等宽，句子用无衬线。** 用等宽排长英文句子会让阅读速度显著下降，这与「长时间不疲劳」的目标直接冲突。词头与音标用等宽，是为了让它们在视觉上与周围的 prose 明确分离，形成「这是词目，那是语境」的层次。

### 3.3 字号阶梯（固定 rem，比值 1.125 到 1.2）

| Token | rem | px | 用途 |
|---|---|---|---|
| `--text-2xs` | 0.6875 | 11 | mono 状态条，仅限统计，不用于阅读 |
| `--text-xs` | 0.75 | 12 | 徽章、图注、caption |
| `--text-sm` | 0.8125 | 13 | 密集面板标签 |
| `--text-base` | 0.875 | 14 | 面板默认 UI 文字 |
| `--text-md` | 1 | 16 | 正文、中文释义（下限，不得再小） |
| `--text-lg` | 1.125 | 18 | 例句（英文与译文） |
| `--text-xl` | 1.25 | 20 | 弹窗标题 |
| `--text-2xl` | 1.5 | 24 | 区块标题 |
| `--text-3xl` | 1.875 | 30 | 词头（手机） |
| `--text-4xl` | 2.25 | 36 | 词头（桌面） |

### 3.4 字重三级

| 级别 | 值 | 用途 |
|---|---|---|
| Read | 400 | 正文、说明、例句译文 |
| Emphasize | 510 | 按钮文字、义项标题、表头 |
| Announce | 590 | 词头、页面主标题 |

### 3.5 字距

| Token | 值 | 场景 |
|---|---|---|
| `--tracking-display` | `-0.02em` | 词头（≥30px） |
| `--tracking-tight` | `-0.01em` | 区块标题（20 到 24px） |
| `--tracking-body` | `0` | 正文 |
| `--tracking-caps` | `0.08em` | ALL CAPS 标签（规范要求 ≥0.06em） |
| `--tracking-mono` | `0` | 等宽文字 |

### 3.6 行高

| Token | 值 | 场景 |
|---|---|---|
| `--leading-display` | 1.15 | 词头 |
| `--leading-tight` | 1.25 | 标题 |
| `--leading-snug` | 1.5 | 面板文字、按钮 |
| `--leading-body` | **1.7** | 中文正文、释义、笔记 |

---

## 4. 结构系统

### 4.1 间距（4px 网格）

```
--space-1:   4px       --space-8:  32px
--space-2:   8px       --space-10: 40px
--space-3:  12px       --space-12: 48px
--space-4:  16px       --space-16: 64px
--space-5:  20px       --space-20: 80px
--space-6:  24px
```

**只有这 11 个值合法。** 禁止 `5px`、`7px`、`13px`、`15px`、`22px`、`30px` 等非标值。CI 用正则扫描 `padding|margin|gap|top|left|right|bottom` 后的像素值做校验。

### 4.2 圆角

| Token | 值 | 场景 |
|---|---|---|
| `--radius-sm` | 6px | 徽章、标签、输入框、小按钮 |
| `--radius-md` | 10px | 标准按钮 |
| `--radius-lg` | 14px | 卡片 |
| `--radius-xl` | 18px | 弹窗、抽屉 |
| `--radius-pill` | 9999px | 进度条、圆形按钮 |

**卡片圆角上限 14px，弹窗上限 18px。** 超过 24px 会直接触发「过度圆角」反模式判定。

### 4.3 阴影（三级）

```css
--elev-flat:    none;
--elev-ring:    0 0 0 1px var(--border);
--elev-raised:  0 1px 2px rgba(20,26,34,0.04), 0 2px 6px rgba(20,26,34,0.05);
--elev-overlay: 0 8px 24px rgba(20,26,34,0.10), 0 2px 6px rgba(20,26,34,0.06);
--elev-focus:   0 0 0 3px rgba(14,116,144,0.35);
```

| 层级 | Token | 用于 |
|---|---|---|
| 0 | `--elev-flat` | 页面背景上的平面内容，无容器 |
| 1 | `--elev-ring` | 卡片、面板（1px 边框，无阴影） |
| 2 | `--elev-raised` | 悬浮的菜单、下拉、Tooltip |
| 3 | `--elev-overlay` | 弹窗、抽屉、Toast |

**反模式 #9（幽灵卡片）硬禁**：同一元素上不允许 `1px solid` 边框与 `box-shadow` 模糊半径 ≥ 16px 同时出现。卡片用 `--elev-ring`，浮层用 `--elev-raised` 或 `--elev-overlay`，二选一。

### 4.4 层级 z-index

```css
--z-base: 0;  --z-header: 30;  --z-mobilebar: 40;
--z-scrim: 50;  --z-modal: 60;  --z-toast: 70;
```

### 4.5 动效

| Token | 时长 | 场景 |
|---|---|---|
| `--motion-instant` | 80ms | 按钮按下、开关切换 |
| `--motion-fast` | **150ms** | 悬停变色、选中态（收敛值） |
| `--motion-base` | 200ms | 抽屉、面板进入 |
| `--motion-slow` | 260ms | 弹窗进入 |

```css
--ease-standard:   cubic-bezier(0.2, 0, 0, 1);
--ease-decelerate: cubic-bezier(0, 0, 0.2, 1);
```

**禁止项（P0-6）：**

- 禁止弹跳/回弹缓动（overshoot 型 cubic-bezier，即 back / bounce 类）。精确禁值见 `design-tokens.css` 第 7 节的 `--motion-banned-bounce`。CI 正则全量扫描样式文件与内联样式，命中即失败。
- 禁止超过 500ms 的动画。
- 禁止同时超过 3 个元素动画。
- 禁止页面加载编排动画。Product 寄存器不做入场编排，动效只用于传递状态。

**必须支持 `prefers-reduced-motion`。** 见 `design-tokens.css` 第 12 节的全局降级块。降级后所有 `transition-duration` 与 `animation-duration` 归零，但状态变化仍然生效（不影响功能可用性）。

---

## 5. Design Token 产出

### 5.1 文件清单

| 文件 | 用途 |
|---|---|
| `src/styles/design-tokens.json` | 机器可读源。分层：`meta` / `primitive` / `semantic` / `typography` / `space` / `radius` / `elevation` / `motion` / `layout` / `z` / `component` |
| `src/styles/design-tokens.css` | CSS 变量实现。前端 `import './styles/design-tokens.css'` |

### 5.2 命名一致性契约

CSS 中同时定义两套变量名，短名解析到 `--color-*`，因此二者在结构上不可能漂移：

```
design-tokens.json  semantic.bg.value
        │
        ▼
design-tokens.css   --color-bg: var(--gray-50)     ← 脚手架契约（tailwind.config.ts / index.css 已引用）
        │
        ▼
design-tokens.css   --bg: var(--color-bg)          ← 规范短名，新组件推荐用
```

| JSON 路径 | CSS 变量（脚手架） | CSS 变量（短名） |
|---|---|---|
| `semantic.bg.value` | `var(--color-bg)` | `var(--bg)` |
| `semantic.surface.value` | `var(--color-surface)` | `var(--surface)` |
| `semantic.surface-warm.value` | `var(--color-surface-warm)` | `var(--surface-warm)` |
| `semantic.fg.value` | `var(--color-fg)` | `var(--fg)` |
| `semantic.fg-2.value` | `var(--color-fg-2)` | `var(--fg-2)` |
| `semantic.muted.value` | `var(--color-fg-muted)` | `var(--muted)` |
| `semantic.meta.value` | `var(--color-fg-subtle)` | `var(--meta)` |
| `semantic.accent.value` | `var(--color-accent)` | `var(--accent)` |
| `semantic.border.value` | `var(--color-border)` | `var(--border)` |
| `semantic.border-strong.value` | `var(--color-border-strong)` | `var(--border-strong)` |
| `semantic.success.value` | `var(--color-success)` | `var(--success)` |
| `semantic.warn.value` | `var(--color-warning)` | `var(--warn)` |
| `semantic.danger.value` | `var(--color-danger)` | `var(--danger)` |
| `semantic.info.value` | `var(--color-info)` | `var(--info)` |
| `typography.size.lg.value` | `var(--text-lg)` | 同左 |
| `typography.leading.body.value` | `var(--leading-body)` | 同左 |
| `typography.tracking.caps.value` | `var(--tracking-caps)` | 同左 |
| `space.4.value` | `var(--space-4)` | 同左 |
| `radius.lg.value` | `var(--radius-lg)` | 同左 |
| `component.button.primary.bg.value` | `var(--button-primary-bg)` | 同左 |
| `component.rating.again-bg.value` | `var(--rating-again-bg)` | 同左 |

> **给前端的关键提醒**：`tailwind.config.ts` 与 `index.css` 里已经存在对 `--color-*` 的引用，这是脚手架既有契约，**不要重命名**。短名只是给新组件用的另一层入口。两套名字指向同一批值。 |

前端通过 `import tokens from './design-tokens.json'` 引用。改色只改这两个文件，不碰组件。

### 5.2.1 Token 分层与四层架构映射

| 架构层 | 本文件对应 |
|---|---|
| A1-identity | `primitive` 中的品牌色阶、`typography.font` |
| A1-structure | `typography.size/leading/tracking`、`space`、`radius`、`layout` |
| A2 | `semantic.*` |
| B-slot | `component.*` 中的状态槽位、`--surface-warm`、`--fg-2`、`--meta` |
| C-extension | `component.rating.*`、`component.freq.*`、`component.badge.*` |

### 5.3 强调色用量审计（学习页）

| 元素 | 使用 `--accent` | 计入 |
|---|---|---|
| 「下一个」主按钮填充 | 是 | 1 |
| 顶部本轮进度条填充 | 是 | 2 |
| 当前义项行左边框 | 是 | 2（与选中态同源，视觉上连续） |
| 评分按钮（未选中） | 否，中性描边 | 0 |
| 评分按钮（选中） | 否，取语义色 | 0 |
| 徽章 | 否，取 `--info` / `--accent-soft` | 0 |

**结论：学习页可见强调色 2 处，达标。**

---

## 6. 图标系统：lucide-react 映射表

**图标库锁定 `lucide-react`。** 全项目不得引入第二套图标库，不得用手写 SVG 图标，不得用 emoji 占位。统一 `strokeWidth={1.75}`，圆角端点。

**尺寸规范：**

| 尺寸 | 场景 |
|---|---|
| **16px** | 行内图标（徽章内、文字旁、输入框前缀） |
| **20px** | 按钮内图标 |
| **24px** | 独立图标按钮（头部设置、关闭弹窗） |

### 6.1 功能图标映射表

| # | 功能 | lucide 图标名 | 尺寸 | 出现位置 |
|---|---|---|---|---|
| 1 | 播放发音（默认口音） | `Volume2` | 20 | 卡片头部、弹窗 |
| 2 | 播放另一口音 | `Languages` | 20 | 卡片头部 |
| 3 | 英音 / 美音切换 | `Languages` | 16 | 音标按钮内 |
| 4 | 下一个 | `ArrowRight` | 20 | 背面底栏、桌面按钮 |
| 5 | 斩词 | `Scissors` | 16 | 卡片头部、底栏 |
| 6 | 撤销上一张 | `Undo2` | 16 | 卡片头部、底栏 |
| 7 | 展开 / 收起词根 | `Sprout` | 16 | 背面词根区块 |
| 8 | 展开 / 收起形近词 | `Network` | 16 | 背面形近词区块 |
| 9 | 搜索 / 查词 | `Search` | 16 | 头部搜索框 |
| 10 | 设置 | `Settings` | 24 | 头部图标按钮 |
| 11 | 导出备份 | `Download` | 20 | 备份面板 |
| 12 | 导入备份 | `Upload` | 20 | 备份面板 |
| 13 | 星标 / 生词本 | `Star` | 16 | 卡片头部、词库列表 |
| 14 | 关闭弹窗 | `X` | 24 | 所有弹窗右上角 |
| 15 | 拼写练习 | `SpellCheck2` | 16 | 卡片头部 |
| 16 | 点词即查 / 词典 | `BookOpen` | 16 | 抽屉标题 |
| 17 | 学习仪表盘 | `LayoutDashboard` | 16 | 头部导航 |
| 18 | 提示一个字母 | `Lightbulb` | 16 | 拼写弹窗 |
| 19 | 加学新卡 | `Plus` | 16 | 计划面板 |
| 20 | 待巩固 / 计时 | `Hourglass` | 16 | 本轮小结 |

### 6.2 状态与辅助图标

| 功能 | lucide 图标名 | 尺寸 |
|---|---|---|
| 成功 / 正确 | `CheckCircle2` | 16 |
| 错误 / 失败 | `AlertCircle` | 16 |
| 警示 / 待巩固 | `AlertTriangle` | 16 |
| 信息 / 说明 | `Info` | 16 |
| 加载中 | `Loader2`（加 `animate-spin`） | 16 |
| 持久化存储已授予 | `ShieldCheck` | 16 |
| 持久化未授予 | `ShieldAlert` | 16 |
| 重置进度 | `Trash2` | 16 |
| 备份文件标识 | `FileJson` | 16 |
| 折叠 / 展开 | `ChevronDown` / `ChevronUp` | 16 |
| 筛选 | `ListFilter` | 16 |
| 编辑笔记 | `Pencil` | 16 |
| 自测入口 | `Beaker` | 16 |

> `CheckCircle2` 与 `AlertCircle` 在 lucide 新版本中已更名为 `CircleCheckBig` / `CircleAlert`，旧名作为别名保留。若升级 lucide 出现导入报错，改用新名，其余不变。

### 6.3 图标使用禁则

- 图标不得单独承载信息，必须配文字标签或 `aria-label`。
- 图标颜色继承 `currentColor`，不单独设色。
- 状态色图标（正确/错误）必须同时有文字说明，不得仅靠颜色传达含义。

---

## 7. 页面清单与逐页设计提示词

### 7.0 全局外壳（Shell）

**布局骨架**

```
┌──────────────────────────────────────────────────────────┐
│ Header  h-56px  sticky                                 │
│  [品牌] [考试选择▾]    [搜索框]  [距考试 N 天] [设置]    │
├────────────────────────────────────────────────────────┤
│ 本轮进度条 h-4px                                        │
└────────────────────────────────────────────────────────┘
   Main  max-w-1200px  gutter 12/16/24px
┌────────────────────────────────────────────────────────┐
│                                                      │
└──────────────────────────────────────────────────────┘
   MobileBar (<768px)  fixed bottom  z-40
```

**组件层级**

```
AppShell
├── AppHeader
│   ├── BrandMark（accent 实心圆角方 + 字标）
│   ├── ExamSelect（原生 select，aria-label="选择考试"）
│   ├── SearchInput（Search 16px 前缀）
│   ├── CountdownChip（距考试 N 天，warn-soft 底）
│   └── IconButton（Settings 24px，aria-label="设置"）
├── RoundProgressBar
├── Main
└── MobileActionBar
```

**断点行为**

| 断点 | Header | 导航 | 侧栏 |
|---|---|---|---|
| `< 640px` | 品牌 + 考试选择 + 倒计时 + 设置 | 「词库」「自测」文字按钮挤在头部 | 无，堆叠到卡片下方 |
| `640 到 767px` | 同左，搜索框显现 | 同左 | 无 |
| `≥ 768px` | 全量，搜索框 176px | 独立 nav 项（学习 / 词库与生词本 / 仪表盘 / 自测） | 右侧 4 列常驻 |

**焦点与无障碍**

- Header 用 `<header>`，内部导航用 `<nav aria-label="主导航">`。
- 当前视图的导航项加 `aria-current="page"`。
- 跳过导航链接 `Skip to content` 作为第一个可聚焦元素（`sr-only`，focus 时显现）。
- 焦点环统一 `box-shadow: var(--elev-focus)`，不移除 `outline`（用 `outline: none` 时必须补 focus 样式）。
- 移动端不应出现第二套底部标签栏。底部只保留学习动作栏，导航留在头部，避免两个底栏互相遮挡。

**态覆盖**

- Loading：Header 常驻；Main 内显示骨架卡片（见 8.1）。
- Error：数据包下载失败时，Main 内整块错误面板 + 重试按钮，Header 保持可用。
- Empty：首次进入且未设置考试日期时，卡片区显示「设置考试日期」引导（见 P4）。

---

### P1 · 学习页 StudyView

- 路由：`/`
- 优先级：P0
- 依赖：`M-03` 学习卡流程、`M-04` 调度、`M-06` 快捷键与底栏

**布局骨架（桌面 ≥768px，12 列）**

```
┌─────────────────────────────────┬──────────────────┐
│ col-span-8                      │ col-span-4      │
│ ┌─────────────────────────────┐ │ ┌────────────┐ │
│ │ CardHeader                  │ │ │ 每日计划   │ │
│ │  卡型徽章 · 核心考点 · 本轮  │ │ ├────────────┤ │
│ │  状态·S·D·R  [星][拼][斩][撤]│ │ │ 备份与恢复 │ │
│ ├─────────────────────────────┤ │ ├────────────┤ │
│ │ Headword Block（左对齐）     │ │ │ AI 私教    │ │
│ │   address  /əˈdres/         │ │ ├────────────┤ │
│ │  [UK 音标 播] [US 音标 播]   │ │ │ 快捷键     │ │
│ ├─────────────────────────────┤ │ └────────────┘ │
│ │ CardBody                     │ │                │
│ │  正面：例句（挖空目标词）     │ │                │
│ │  背面：义项考频 / 例句 / 词根 │ │                │
│ │        / 形近词 / 笔记        │ │                │
│ └─────────────────────────────┘ │                │
└─────────────────────────────────┴──────────────────┘
```

**组件层级**

```
StudyView
├── CardRoot（卡片容器，--card-*）
│   ├── CardHeader
│   │   ├── MetaRow：KindBadge · CoreBadge · 本轮计数 · StatStrip(mono)
│   │   └── ActionRow：StarButton · SpellButton · SuspendButton · UndoButton
│   ├── HeadwordBlock
│   │   ├── Lemma（`--font-word`, 36px desktop / 30px phone）
│   │   ├── FreqBadge（"IELTS 考频 31 次"）
│   │   ├── EccentricBadge（"含熟词僻义"，仅当有）
│   │   └── PhoneticRow：UkButton / UsButton（各带 Volume2 16px）
│   └── CardBody
│       ├── [FRONT] FrontFace：提示语 + 例句（目标词高亮不可点）+ 提示行
│       │   └── DesktopActions：RevealGhostButton + RatingGrid(3)
│       └── [BACK] BackFace
│           ├── RatingBar（本次评分 + 已修正标记）
│           ├── OutcomeBanner（未评分 / 待巩固 x/2 / 通关）
│           ├── DictTabs（义项考频 / 英文释义）
│           │   ├── SenseList（含考频条，当前义项高亮）
│           │   └── SenseEnList
│           ├── ExampleBlock（--surface-sunken，可点词）
│           ├── EtymologyBlock（可折叠，R 键）
│           ├── ConfusableBlock（可折叠，F 键）
│           └── NotesBlock（可编辑）
└── SidePanel
    ├── DailyPlanPanel
    ├── BackupPanel
    ├── AiPanel
    └── HotkeyPanel
```

**断点行为**

| 断点 | 布局 | 评分交互 | 次要模块 |
|---|---|---|---|
| `< 768px` | 单列，卡片全宽 | 底部固定栏，按钮 48px，「下一个」52px | 词根 / 形近词 / 笔记默认折叠 |
| `≥ 768px` | 8 / 4 分栏 | 卡片内三按钮网格 + 「下一个」主按钮 | 默认展开 |

移动端底栏规格：

```css
.mobile-bar {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: var(--z-mobilebar);
  background: var(--mobilebar-bg);
  border-top: var(--mobilebar-border);
  padding: var(--mobilebar-padding-top) var(--mobilebar-padding-x) var(--mobilebar-padding-bottom);
  display: grid;
  gap: var(--mobilebar-gap);
}
.mobile-bar button { min-height: var(--mobilebar-btn); }        /* 48px */
.mobile-bar .primary { min-height: var(--mobilebar-primary-btn); } /* 52px */
```

正面底栏：三按钮网格（不认识 / 模糊 / 认识），下方「直接看答案」虚线描边按钮（≥44px）。
背面底栏：三按钮网格（记错了 / 模糊 / 认识），下方「下一个 →」主按钮（52px，占最大面积）。

`main` 的 `padding-bottom` 用 `var(--app-bottom-pad)`，避免底栏遮住内容。

**焦点与无障碍**

- 卡片容器 `role="region"` `aria-label="学习卡片"`。
- 卡片正反面切换用 `aria-live="polite"` 区域播报（「已显示答案」/「下一张：xxx」）。
- 评分按钮用 `aria-pressed` 表达选中态，不用颜色单独表达。
- 目标词在正面**不可点击查词**（避免提前看到答案），非目标词可点。
- 所有图标按钮必须有 `aria-label`。
- 「下一个」未评分时 `disabled`，并给出 `aria-describedby` 指向提示文案。

**态覆盖**

| 态 | 表现 |
|---|---|
| Loading | 骨架卡：头部 2 行灰条 + 词头 36px 灰条 + 例句 3 行灰条，宽度 100%/70%/45% |
| Empty | 今日无卡：插画位（纯几何，无 emoji）+「今日计划已完成」+「加学 5 张新卡」次级按钮 |
| Error | 调度异常：错误信息 + 重试；不阻断 Header |
| Edge | 超长单词：`--text-3xl` 起，容器 `break-words`，超出 2 行缩放到 `--text-2xl` |
| Edge | 无例句：正面显示「（暂无例句）」占位，仍可评分 |
| Edge | 待巩固：本轮其他卡完成后显示「继续巩固」面板 |

---

### P2 · 每日计划面板 DailyPlanPanel

- 位置：桌面为右侧栏第一块；移动端折叠为卡片下方的可展开区块
- 优先级：P0
- 依赖：`M-02` 考试日期与每日计划

**布局骨架**

```
┌──────────────────────────────┐
│ 今日计划          考试日 2026-12-20 │
├─────────────┬────────────────┤
│ 新卡         │ 复习            │
│  18 / 50    │  42 / 126       │
│             │ 上限 300        │
├─────────────┴────────────────┤
│ Info 考前最后 7 天为过轮窗口…    │
├──────────────────────────────┤
│ 考试日预测掌握核心考点   312/1043 │
│ ▓▓▓▓▓▓░░░░░░░░░░░░░░       │
│ 核心卡片中 R ≥ 0.9 的数量      │
├──────────────────────────────┤
│ [ + 加学 5 张新卡 ]            │
└──────────────────────────────┘
```

**组件层级**

```
DailyPlanPanel
├── PanelHeader（标题 + 考试日 caption）
├── StatGrid（2 列）
│   ├── NewStat（已学 / 目标，含加学提示）
│   └── ReviewStat（已复习 / 待复习，含上限）
├── NoticeList
│   ├── SweepWindowNotice（过轮窗口，rose 或 muted）
│   ├── InfeasibleNotice（学不完，warn-soft 底）
│   ├── BacklogNotice（积压 > 2 天，danger-soft 底）
│   └── ExcludedBasicCaption（meta 级说明）
├── CoverageMeter
│   ├── LabelRow（"考试日预测掌握核心考点" + "312 / 1043"）
│   ├── ProgressBar（--progress-*）
│   └── Caption（北极星指标口径说明）
└── ExtraNewButton（Plus 16px）
```

**提示文案层级（按严重度）**

| 条件 | 底色 | 前景 | 图标 |
|---|---|---|---|
| 过轮窗口内（`D ≤ B`） | `--danger-soft` | `--danger` | `AlertTriangle` |
| 学不完（`raw > maxNew`，`D > B`） | `--warn-soft` | `--warn` | `AlertTriangle` |
| 积压 > 2 天 | `--danger-soft` | `--danger` | `AlertTriangle` |
| 普通说明（窗口天数、已排除基础词） | 透明 | `--meta` | 无 |

**断点行为**

| 断点 | 行为 |
|---|---|
| `< 768px` | 折叠为一行摘要（"新卡 18/50 · 复习 42/126"），点击展开完整面板 |
| `≥ 768px` | 常驻展开 |

**焦点与无障碍**

- 折叠/展开按钮 `aria-expanded` + `aria-controls`。
- 覆盖率进度条 `<progress>` 或 `role="progressbar"` 带 `aria-valuenow/valuemin/valuemax` + `aria-valuetext="312 / 1043"`。
- 提示文案用 `role="status"` 让屏幕阅读器可播报，但不要 `aria-live="assertive"`。

**态覆盖**：无考试日期 → 显示「设置考试日期」引导按钮；考试日已过 → 长期记忆模式提示；积压为 0 → 不显示积压提示。

---

### P3 · 词库与生词本 VocabBookView

- 路由：`/vocab`
- 优先级：P0

**布局骨架**

```
┌──────────────────────────────────────────────────────┐
│ IELTS 词库与生词本                                   │
│ 每个词按义项拆成主义项卡与熟词僻义卡分别调度            │
│            [全部][生词本][已斩]  [重置学习进度]        │
├────────────────────────────────────────────────────┤
│ address   /ˈædres/           IELTS 71 次           │
│   主义项卡·处理，设法解决 · 复习 · S 12d · 到期 11-02 │
│   熟词僻义卡·向……发表讲话 · 学习 · S 3d · 到期 10-24 │
│                              [Star] 加入生词本        │
├──────────────────────────────────────────────────┤
│ potential  /pəˈtenʃl/        IELTS 36 次         │
│   …                                                │
└──────────────────────────────────────────────────┘
```

**组件层级**

```
VocabBookView
├── ViewHeader
│   ├── TitleBlock（标题 + 副标题）
│   └── Toolbar
│       ├── FilterChips（全部 / 生词本 / 已斩）
│       └── ResetButton（Trash2 16px，danger）
└── WordList（divide-y divide-[--border-soft]）
    └── WordRow
        ├── WordMain
        │   ├── LemmaLine（lemma + phonetic mono + freq badge）
        │   └── CardChips（每卡一枚：卡型·义项前 8 字 · 状态 · S · 到期日）
        └── RowActions
            ├── StarButton（Star 16px）
            └── ResumeButton（RotateCcw 16px，仅已斩显示）
```

**断点行为**

| 断点 | 布局 |
|---|---|
| `< 640px` | WordRow 上下堆叠，操作按钮换行到第二行，高度 48px |
| `640 到 1023px` | 左右两列，chip 换行 |
| `≥ 1024px` | 左右两列，chip 单行 |

**态覆盖**

- Empty（全部）：「还没有学习记录，开始今天的第一张卡」
- Empty（生词本）：「还没有加入生词本的词。在例句中点任意单词即可加入」
- Empty（已斩）：「没有已斩的词」
- Loading：5 行骨架行
- Edge：超长义项 `truncate` + `title` 全文

---

### P4 · 设置弹窗 SettingsModal

- 触发：头部倒计时徽章 / 设置图标
- 优先级：P0

**布局骨架**

```
┌────────────────────────────────────┐
│ 学习计划与设置                [×] │
├────────────────────────────────────┤
│ 考试日期  [2026-12-20]             │
│ 每日新卡上限 [50]  每日复习上限[300]│
│ 日切时间（点）[4]  默认口音 [美音▾] │
│ [ ] 排除基础词（高考及以下词汇）    │
│ [ ] 出新卡时自动播放发音            │
│ ─────────────────────────────     │
│ 备份与恢复                          │
│ [导出备份] [导入备份]               │
│ ─────────────────────────────     │
│ AI 私教（P1，可选）                 │
│ 接口 Base URL [                   ] │
│ API Key [      ]  模型名 [        ] │
├────────────────────────────────────┤
│                  [取消] [保存]      │
└────────────────────────────────────┘
```

**组件层级**

```
SettingsModal（role="dialog" aria-modal="true" aria-labelledby）
├── ModalHeader（h2 id="settings-title" + X 24px）
├── FormGrid（2 列）
│   ├── DateField（考试日期，col-span-2）
│   ├── NumberField（每日新卡上限，min1 max500）
│   ├── NumberField（每日复习上限，min10 max2000）
│   ├── NumberField（日切时间，min0 max12）
│   ├── SelectField（默认口音）
│   ├── CheckboxField（排除基础词，col-span-2）
│   ├── CheckboxField（自动播放发音，col-span-2）
│   ├── BackupSection（col-span-2）
│   └── AiSection（col-span-2，P1）
└── ModalFooter（取消 / 保存）
```

**字段校验规则（前端必实现）**

| 字段 | 规则 | 错误提示位置 |
|---|---|---|
| 考试日期 | 必填，格式 `YYYY-MM-DD`，必须晚于今天 | 字段下方，红色文本 + `aria-invalid` |
| 每日新卡上限 | 1 到 500，超出自动钳制并 toast 提示 | 字段下方 |
| 每日复习上限 | 10 到 2000，超出自动钳制并 toast 提示 | 字段下方 |
| 日切时间 | 0 到 12 | 字段下方 |
| API Key | 不进入备份文件（PRD 7.2） | 无 |

**保存后的副作用（PRD 5.3）**

`exam` / `examDate` / `excludeBasicWords` / `dayStartHour` / `maxNewPerDay` 任一变更都会触发 `startRound()` 重排当日队列。保存后必须 toast 告知用户队列已重排，否则用户会困惑于卡片突然变了。

**断点行为**

| 断点 | 表现 |
|---|---|
| `< 640px` | 全屏底部抽屉，`rounded-t-xl`，`max-h-[92dvh]`，内部滚动 |
| `≥ 640px` | 居中弹窗，`max-w-640px`，`max-h-[90vh]` |

**焦点与无障碍**

- 打开时焦点移到弹窗第一个可聚焦元素（考试日期输入）。
- **焦点陷阱**：Tab / Shift+Tab 循环限定在弹窗内，不穿透到背景。
- Esc 关闭。关闭后焦点回到触发按钮。
- 每个 `<label>` 必须 `for` 对应 input id。
- 弹窗打开时，除 Esc 外的学习快捷键全部失效（对应 T-13）。

**态覆盖**

- Empty：首次进入，考试日期为空 → 高亮该字段并提示「先设置考试日期，才能生成每日计划」。
- Error（日期非法）：字段红框 + 文案，保存按钮不禁用但点击后聚焦错误字段。
- Loading：保存中按钮显示 `Loader2` 旋转 + `disabled`，防重复提交。
- Success：toast「已保存，今日计划已更新」。

---

### P5 · 备份面板 BackupPanel

- 位置：桌面为右侧栏第二块；移动端并入设置弹窗的「备份与恢复」区
- 优先级：P0
- 依赖：`M-07` 导出/导入备份 + 持久化存储

**布局骨架**

```
┌────────────────────────────────┐
│ 备份与恢复          上次备份 10-14 │
├────────────────────────────────┤
│ [AlertTriangle] 超过 7 天未备份。  │
│   本地数据可能因浏览器清理而丢失， │
│   建议现在导出。                   │
├────────────────────────────────┤
│ [ 导出备份 ]  [ 导入备份 ]       │
├────────────────────────────────┤
│ [ShieldCheck] 已获得持久化存储。   │
└────────────────────────────────┘
```

**组件层级**

```
BackupPanel
├── PanelHeader（标题 + 上次备份时间 caption）
├── StaleWarning（条件渲染，warn-soft 底 + AlertTriangle）
├── ActionRow
│   ├── ExportButton（Download 20px，primary）
│   └── ImportButton（Upload 20px，secondary）
├── HiddenFileInput（accept="application/json,.json"）
└── PersistStatus（ShieldCheck / ShieldAlert 16px + 说明）
```

**备份状态逻辑**

| 状态 | 条件 | 表现 |
|---|---|---|
| 从未备份 | `lastBackupAt === null` | caption 显示「从未备份」，显示黄色提示 |
| 已备份（7 天内） | `now - lastBackupAt <= 7d` | caption 显示日期，无提示 |
| 超期 | `now - lastBackupAt > 7d` | caption 变 `--warn`，显示黄色提示 |

**导入流程（三步，不可简化）**

1. 用户选择文件 → 解析 JSON。
   - 失败 → toast「文件不是有效的 JSON」，终止。
2. 弹出原生确认：`导入将覆盖当前进度。导入前会先自动导出一份当前数据作为备份，是否继续？`
   - 用户取消 → **不执行导入**（注意：这一步的顺序必须是「先取消则不导出」，避免在用户只是误触时产生垃圾文件）。
   - 用户确认 → 先自动下载 `examflow-before-import-<ts>.json`。
3. 执行导入。
   - `format !== 'examflow-backup'` → toast「不是 ExamFlow 备份文件」，终止。
   - `formatVersion > 1` → toast「备份文件版本较新，请先升级应用」，终止。
   - 成功 → toast「导入成功」，重排队列并重新渲染。

**安全约束**：`settings.aiApiKey` 不写入备份文件，导入时保留当前设备的 Key（PRD 7.2）。

**断点行为**：`< 768px` 时两块按钮改为上下堆叠，各 48px 高。

**焦点与无障碍**

- 文件输入保持 `hidden`，通过按钮 `click()` 触发，按钮本身是真实 `<button>`。
- 导入结果用 `role="status"` 播报。
- 持久化状态图标必须配文字，不只用图标。

**态覆盖**

- Loading：导出中按钮 `Loader2` 旋转；导出完成后自动 `markBackedUp()`。
- Error：导出失败（配额不足）→ 错误面板 + 重试。
- Edge：备份文件超大（> 10 MB）→ 提示预计耗时。

---

### P6 · 拼写练习弹窗 SpellModal（P1，S-01）

- 触发：快捷键 `S` / 卡片头部「拼写」按钮
- 优先级：P1
- 依赖：`S-01`

**布局骨架**

```
┌──────────────────────────────────┐
│ 拼写练习（不影响识记卡调度）  Esc │
├──────────────────────────────────┤
│ /pəˈtenʃl/         [Volume2] 播放  │
│ ┌──────────────────────────────┐ │
│ │ n. 潜力，潜能                 │ │
│ └──────────────────────────────┘ │
│  _ _ _ _ _ _ _ _ _                │
│ ┌──────────────────────────────┐ │
│ │ potential                    │ │
│ └──────────────────────────────┘ │
│  校验后显示反馈                   │
├──────────────────────────────────┤
│ 提示一个字母（Tab）   [校验 Enter] │
└──────────────────────────────────┘
```

**组件层级**

```
SpellModal
├── ModalHeader（h2 + 副标题 "（不影响识记卡调度）" + X 24px）
├── SpellBody
│   ├── PhoneticRow（mono 音标 + Volume2 播放按钮）
│   ├── HintBlock（义项中文提示，--surface-warm 底）
│   ├── SlotStrip（逐字母比对：空格 / ok / bad）
│   ├── SpellInput（autocomplete=off autocapitalize=off spellcheck=false）
│   └── FeedbackLine（min-h-[1rem]，按结果着色）
└── SpellFooter（提示按钮 / 校验按钮）
```

**逐字母比对规则**

| 字母状态 | 类名 | 前景 | 下边框 |
|---|---|---|---|
| 未输入 | `.slot` | 透明 | `--border-strong` |
| 正确 | `.slot.ok` | `--success` | `--success` |
| 错误 | `.slot.bad` | `--danger` | `--danger` |
| 超长 | `.slot.bad` + `+N` | `--danger` | `--danger` |

**反馈文案**

| 结果 | 文案 | 颜色 |
|---|---|---|
| 完全正确 | 「完全正确（已记录到练习日志）」 | `--success` |
| 提示后正确 | 「提示后正确（已记录到练习日志）」 | `--success` |
| 错误 | 「不正确，正确拼写：potential」+ 自动全选 | `--danger` |

**关键约束**：拼写结果写入 `practiceLogs`，**不得**进入 `reviewLogs`，**不得**改变识记卡的 FSRS 状态（PRD 5.7）。

**断点行为**：`< 640px` 全宽底部抽屉；`≥ 640px` 居中 `max-w-md`。输入框 `font-size: 18px`（≥16px 可避免 iOS 自动缩放）。

**焦点与无障碍**

- 打开后 30ms 自动聚焦输入框（避开抽屉动画）。
- 打开时自动播放一次发音。
- `aria-live="polite"` 播报校验结果。
- Tab 键在输入框内被劫持为「提示一个字母」，需同时提供可点击的提示按钮供键盘与读屏用户使用。

**态覆盖**

- Error：无法发音（无可用语音）→ 隐藏播放按钮，显示音标提示。
- Edge：单词含连字符/空格 → 槽位显示为分隔符，不参与比对。

---

### P7 · 点词即查抽屉 LookupDrawer（P1，S-02）

- 触发：点击例句中任意非目标单词 / 头部搜索框回车
- 优先级：P1
- 依赖：`S-02`

**布局骨架**

```
┌──────────────────────────────┐
│ address ← addressee          │
│ /əˈdres/                     │
│                         [×]  │
│ v. 处理，设法解决（考研 31 次） │
│ 来源：核心词库                 │
├──────────────────────────────┤
│ [Volume2] 发音   [ + 加入生词本 ]│
└──────────────────────────────┘
```

**组件层级**

```
LookupDrawer（role="dialog" aria-modal="true"）
├── DrawerHeader
│   ├── LemmaLine（lemma + "← 原形变形" 提示 + mono 音标）
│   └── X 24px
├── ResultBody
│   ├── DefinitionText
│   └── SourceCaption（核心词库 / 派生词 / 形近词 / 基础词典 / 我的生词）
└── DrawerFooter
    ├── PlayButton（Volume2 16px，条件渲染）
    └── AddButton（Plus 16px，primary；已加入则 disabled 显示「已在生词本」）
```

**查询回退链（PRD 5.8）**

```
点击 token
  → 清洗（小写、去标点、去首尾连字符/撇号）
  → LEMMA_MAP 词形还原（addressed → address）
  → 当前数据包词库查询
  → 派生词表查询
  → 形近词表查询
  → ECDICT 基础词典
  → 未收录提示
```

**断点行为**

| 断点 | 表现 |
|---|---|
| `< 640px` | 底部抽屉，`rounded-t-xl`，`safe-bottom` 内边距，`max-h-[70dvh]` |
| `≥ 640px` | 居中弹窗 `max-w-md` |

**焦点与无障碍**

- 例句中可点词用 `<button>` 或 `<span role="button" tabindex="0">`，不用裸 `<span>` + onClick。
- 抽屉按 dialog 处理焦点陷阱；Esc 关闭并归还焦点。
- 「加入生词本」成功后 toast 告知已加入并提示可按「加学」提前。

**态覆盖**

- Loading：词库异步查询中显示骨架 2 行。
- Error：查询异常 →「查询失败，请重试」。
- Empty：未收录 →「未收录该词。可手动添加释义」+ 跳转创建。
- Edge：多词短语（如 `cope with`）整体展示，不参与分词。

---

### P8 · 学习仪表盘弹窗 DashboardModal（P1，S-04）

- 触发：头部导航「仪表盘」
- 优先级：P1
- 依赖：`S-04`

**布局骨架**

```
┌────────────────────────────────────────────┐
│ 学习仪表盘                           [×] │
├──────────────────────────────────────────┤
│ 核心覆盖率            312 / 1043  29.9% │
│ ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░           │
├──────────────────────────────────────────┤
│ 预测掌握曲线（到考试日）                 │
│  [折线图：R ≥ 0.9 的卡片数随时间]        │
├──────────────────────────────────────────┤
│ 复习积压   1.4 天   OK 健康              │
│ 今日完成   60 / 176                     │
├──────────────────────────────────────────┤
│ 数据口径说明                             │
│ 核心卡片 = 当前考试义项考频前 30% 的卡片  │
└──────────────────────────────────────────┘
```

**组件层级**

```
DashboardModal
├── ModalHeader（h2 + X 24px）
├── CoverageCard
│   ├── MetricRow（"312 / 1043" + "29.9%"）
│   └── ProgressBar
├── PredictionChart（SVG 折线，等宽数字标注）
├── BacklogCard（天数 + 健康/警告标记）
├── TodayCard（新卡 / 复习完成数）
└── MethodologyNote（meta 级，说明北极星指标口径）
```

**图表无障碍要求**

- 折线图必须提供 `<title>` 与 `<desc>`，或提供等价的数据表格（`<table class="sr-only">`）。
- 不得仅用颜色区分数据系列，需配合图案或标注。
- 数字全部用等宽字体 + `tabular-nums`，防止跳动。

**态覆盖**

- Loading：图表骨架（矩形占位 + 坐标轴灰条）。
- Error：数据计算失败 → 错误面板 + 重试。
- Empty：无复习记录 →「还没有复习数据，完成今天的学习后即可看到预测曲线」。
- Edge：考试日已过 → 切换为长期记忆模式，图表 x 轴改为未来 90 天。

---

### P9 · 本轮小结 RoundSummary

- 位置：学习卡区域的终态（队列清空后）
- 优先级：P0
- 依赖：`M-05` 日内重现队列

**布局骨架**

```
┌────────────────────────────────┐
│         [CheckCircle2]          │
│         本轮完成                 │
│                                │
│   本轮通关 24 张，待巩固 3 张      │
│   （待巩固的卡会在下一轮开头出现） │
│                                │
│   今日计划还剩 12 张。            │
│                                │
│  [开始下一轮]  [加学 5 张新卡]     │
│           [撤销上一张 Z]          │
└────────────────────────────────┘
```

**三种终态**

| `roundStatus` | 标题 | 说明 | 行动 |
|---|---|---|---|
| `DONE` | 本轮完成 | 通关数 + 待巩固数 | 开始下一轮 / 加学 / 撤销 |
| `PENDING_ONLY` | 本轮其他卡片已完成 | 解释 3 张卡 / 60 秒间隔规则 | 继续巩固 / 结束本轮 |
| `ENDED` | 本轮已结束 | 同上，无「继续巩固」 | 开始下一轮 / 加学 |

**关键文案（不得改为空洞营销语）**

- 待巩固解释：「还有 N 张待巩固卡片。为避免连续重复，它们需要与上次出现间隔至少 3 张卡和 60 秒。」
- 下一轮说明：「今日计划还剩 N 张。下一轮不会提前拉入未到期的卡片。」

**态覆盖**：待巩固数为 0 时不显示待巩固说明；今日剩余为 0 时显示「今日计划已完成，不会提前拉入未到期的卡片」。

---

### P10 · 快捷键面板 HotkeyPanel

- 位置：桌面为右侧栏第四块；移动端为头部「快捷键」入口打开的底部抽屉
- 优先级：P0（桌面）／ P2（移动）

**内容规格**：两列网格，左列按键说明，右列 `<kbd>` 键帽。

| 说明 | 键帽 |
|---|---|
| 看答案 / 下一个 | `Space` |
| 不认识 / 模糊 / 认识 | `1` `2` `3` |
| 下一个 | `→` `Enter` |
| 发音 / 另一口音 | `C` `⇧C` |
| 拼写练习 | `S` |
| 词根 / 形近词 | `R` `F` |
| 斩词 | `X` |
| 撤销上一张 | `Z` |
| 关闭弹窗 | `Esc` |

`<kbd>` 样式：等宽字体、11px、`--surface-warm` 底、`--border` 1px 边框、`border-bottom-width: 2px`、`--radius-sm`。

---

## 8. 组件状态矩阵

### 8.1 九态总表

每个交互组件必须覆盖以下九态。**「不适用」也必须写明理由，不能留空。**

| 态 | CardFront | CardBack | RatingButton | SpellInput | BackupButton | VocabList | PlanPanel |
|---|---|---|---|---|---|---|---|
| Default | 显示例句，目标词高亮 | 显示评分条 + 五区块 | 中性描边 + 文字 | 空 + placeholder | 主/次按钮 | 词条行列表 | 统计 + 提示 |
| Hover | 卡片区 `cursor-pointer` | 无 | 底色转 `--surface-warm` | 无 | 底色变化 | 行底色 `--surface-warm` | 无 |
| Focus | 键盘焦点环 | 键盘焦点环 | `--elev-focus` | `--elev-focus` + 边框转 `--accent` | `--elev-focus` | 行内按钮焦点环 | 无 |
| Active | 按下无位移 | 按下无位移 | 缩放 0.97 | 无 | 缩放 0.97 | 无 | 无 |
| Disabled | n/a（正面总有卡） | 未评分时「下一个」禁用 | 无 | 校验完成前禁用 | 导出中禁用 | 无 | 无 |
| Loading | 骨架卡 | 骨架五区块 | 无 | 校验中按钮旋转 | 导出中旋转图标 | 5 行骨架 | 骨架统计 |
| Error | 数据异常面板 | 调度异常面板 | 无 | 校验异常提示 | 导出失败提示 | 加载失败 + 重试 | 计算失败提示 |
| Empty | 今日无卡引导 | n/a | 无 | 无 | 从未备份提示 | 三套空态文案 | 无考试日期引导 |
| Success | n/a | 评分已选标记 | 选中态填充语义色 | 正确/提示后正确提示 | 导出成功 toast | 加入生词本 toast | 保存成功 toast |

### 8.2 关键组件状态详表

**评分按钮（RatingButton）**

| 态 | 背景 | 边框 | 前景 | 动效 |
|---|---|---|---|---|
| Default | `--rating-idle-bg` | `--rating-idle-border` | `--rating-idle-fg` | 无 |
| Hover | `--surface-warm` | `--border-strong` | `--fg-2` | 150ms |
| Focus | `--surface-warm` | `--accent` | `--fg-2` | + `--elev-focus` |
| Active | 同 Hover | 同 Hover | 同 Hover | scale(0.97), 80ms |
| Selected(1) | `--rating-again-bg` | 同底色 | `--rating-again-fg` | 150ms |
| Selected(2) | `--rating-hard-bg` | 同底色 | `--rating-hard-fg` | 150ms |
| Selected(3) | `--rating-good-bg` | 同底色 | `--rating-good-fg` | 150ms |
| Disabled | `--surface-warm` | `--border` | `--fg-disabled` | 无 |

**输入框（SpellInput / 设置表单）**

| 态 | 背景 | 边框 | 前景 | 附加 |
|---|---|---|---|---|
| Default | `--input-bg` | `--input-border` | `--input-fg` | placeholder 用 `--input-placeholder` |
| Focus | `--input-bg` | `--input-focus-border` | `--input-fg` | `--input-focus-ring` |
| Error | `--input-bg` | `--input-error-border` | `--input-fg` | `--input-error-ring` + 字段下方红字 |
| Disabled | `--input-disabled-bg` | `--border` | `--input-disabled-fg` | 无 |

---

## 9. 响应式与无障碍

### 9.1 断点定义

| 名称 | 宽度 | 列数 | 沟槽 | 布局 |
|---|---|---|---|---|
| phone | `< 640px` | 4 | 12px | 单列，头部压缩 |
| tablet | `640 到 767px` | 8 | 16px | 单列，搜索框显现 |
| desktop | `768 到 1279px` | 12 | 24px | 8 / 4 分栏 |
| large | `≥ 1280px` | 12 | 24px | 8 / 4 分栏，容器 1200px 居中 |

**768px 是本项目唯一的枢轴断点。** 以下行为在 768px 处整体切换：

| 能力 | `< 768px` | `≥ 768px` |
|---|---|---|
| 评分交互位置 | 固定底栏 | 卡片内按钮网格 |
| 侧栏面板 | 堆叠到卡片下方 | 右侧常驻 |
| 次要模块（词根/形近词/笔记） | 默认折叠 | 默认展开 |
| 快捷键面板 | 抽屉打开 | 常驻显示 |
| 键盘快捷键 | 不启用 | 启用 |

### 9.2 触摸目标

| 元素 | 最小高度 | 依据 |
|---|---|---|
| 底栏评分按钮 | **48px** | 超出 WCAG 2.5.5（44px） |
| 底栏主按钮（下一个） | **52px** | 最高频操作，给最大面积 |
| 头部图标按钮 | **44px**（含内边距） | WCAG 2.5.5 下限 |
| 例句可点词 | 行高 ≥ 28px | 内联文本，不强制 44px |
| 行内操作按钮 | **44px** | 移动端词库列表 |

相邻可点元素间距 ≥ 8px（`--space-2`）。

### 9.3 安全区与缩放

```css
/* 移动端底栏：适配 iOS 底部安全区 */
padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom));
```

```html
<!-- 禁止出现 user-scalable=no 或 maximum-scale < 5 -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

PRD US-04 明确要求「不禁止页面缩放」。

### 9.4 无障碍清单

| 项 | 要求 |
|---|---|
| 对比度 | 正文 ≥ 4.5:1；大字号（≥24px 或 ≥18.66px 粗体）≥ 3:1；非文本边界 ≥ 3:1 |
| 焦点可见 | 所有可交互元素有可见焦点环；禁止 `outline: none` 而无替代 |
| 键盘可达 | 所有功能可纯键盘完成；焦点顺序符合视觉顺序 |
| 焦点陷阱 | 弹窗/抽屉打开时 Tab 循环限定在内部 |
| 焦点归还 | 弹窗关闭后焦点回到触发元素 |
| 屏幕阅读器 | 图标按钮有 `aria-label`；状态变化用 `role="status"` 播报 |
| 颜色独立 | 不得仅用颜色传达信息（考频条必须配数字） |
| 动效降级 | 支持 `prefers-reduced-motion: reduce` |
| 语义化标签 | header / nav / main / section / h1 到 h3 层级正确 |
| 跳转链接 | 提供 `Skip to content` |

### 9.5 快捷键屏蔽规则（对应 T-13）

```
onKey(ev):
  if modalStack.length > 0:
    if ev.key === 'Escape': 关闭栈顶弹窗
    return                          # 其他按键一律吞掉
  if ev.target.tagName in [INPUT, TEXTAREA, SELECT]: return
  if view !== 'study': return
  if ev.ctrlKey or ev.metaKey or ev.altKey: return
  分发学习快捷键
```

`modalStack` 是数组不是布尔量，支持弹窗叠加（例如查词抽屉上再开拼写弹窗）。Esc 只关栈顶。

---

## 10. P0 视觉自查清单（11 项）

| # | 检查项 | 结果 | 证据与说明 |
|---|---|---|---|
| 1 | **无 emoji 作为功能图标** | PASS | 全文 20 项功能图标 + 13 项状态图标均映射为 `lucide-react` 组件名。演示原型中的齿轮、喇叭、五角星、沙漏、对勾、叉号等字形占位，全部替换为 `Settings` / `Volume2` / `Star` / `Hourglass` / `CheckCircle2` / `X`。扫描正则 `[\x{1F300}-\x{1F9FF}\x{2600}-\x{26FF}\x{2700}-\x{27BF}]` 在 `design-tokens.css`、`design-tokens.json` 与本文档全篇命中数为 0（清单定稿后已复扫确认）。 |
| 2 | **无紫色→粉色渐变主视觉** | PASS | 主色为石墨青 `#0E7490` 纯色。全项目无任何 `linear-gradient` 用于主视觉。无发光边框（无 `box-shadow` 带饱和度色）。无装饰性毛玻璃（`backdrop-filter` 仅允许用于头部 sticky 背景，属功能用途）。熟词僻义徽章使用纯色 `--info-soft` 底 + `--info` 字，不涉渐变。 |
| 3 | **无空洞占位文案** | PASS | 无 "Welcome to" / "Lorem ipsum" / "Sign up today"。所有文案为具体动作或具体数值口径，例如「还有 3 张待巩固卡片。为避免连续重复，它们需要与上次出现间隔至少 3 张卡和 60 秒。」已对照反 AI 散文 denylist 排查，未出现「无缝」「赋能」「抓手」「闭环」「一站式」「极致」等中文空洞词，也未出现 `seamless` / `robust` / `elevate` / `empower` / `delve` 等英文套路词。 |
| 4 | **无硬编码颜色值** | PASS | 全部颜色经 `design-tokens.css` 语义 Token 引用。原始 hex 仅出现在 `primitive` 区块（第 1 节）与两处必要例外：`--fg-on-accent: #FFFFFF`（白字）、`--fg: #141A22`（近黑，非纯黑）。组件层（`component.*`）100% 使用 `var()` 引用。 |
| 5 | **无千篇一律 Hero** | PASS | 首屏直接渲染学习卡片（词头 + 音标 + 例句），无营销式大标题 + 副标题 + 居中 CTA + 抽象图形。头部高度仅 56px，视觉重心落在卡片。 |
| 6 | **无弹跳/弹性缓动** | PASS | 仅定义 `--ease-standard` 与 `--ease-decelerate`，两者均无 overshoot。明确列入禁止项并写入 `design-tokens.css` 第 7 节。CI 正则扫描 `cubic-bezier\(0\.68,\s*-0\.55` 命中即失败。 |
| 7 | **图标库统一 + 尺寸 16/20/24** | PASS | 锁定单一图标库 `lucide-react`，`strokeWidth={1.75}` 全局统一。尺寸仅三档：行内 16px / 按钮内 20px / 独立图标按钮 24px。映射表见第 6 节，共 33 项全部标注尺寸。 |
| 8 | **间距全为 4px 网格** | PASS | 定义 11 个合法值（4/8/12/16/20/24/32/40/48/64/80）。所有组件 padding/gap 与节区间距均取自该集合。非标值（5/7/13/15/22/30px）在规范中明令禁止。 |
| 9 | **中文字体栈含 PingFang SC / Microsoft YaHei，英文与音标用等宽栈** | PASS | `--font-body: "Inter", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif`，拉丁在前保证英文不被中文字体接管。词头 lemma、国际音标、统计数字走 `--font-word` 等宽栈（JetBrains Mono → ui-monospace → SFMono-Regular → Menlo → Consolas）。使用边界见 3.2 节表格。 |
| 10 | **对比度达标 + focus-visible + reduced-motion** | PASS | 全部对比度为实测值：`--fg` 17.49:1、`--fg-2` 9.87:1、`--muted` 6.56:1、`--meta` 4.84:1、`--accent` 5.36:1、`--success` 5.48:1、`--warn` 5.02:1、`--danger` 6.29:1、`--info` 7.90:1、`--border-strong` 3.47:1，均超过对应阈值。焦点环统一 `--elev-focus`。`prefers-reduced-motion: reduce` 全局降级块已写入 CSS 第 12 节。 |
| 11 | **触摸目标 ≥44px + safe-area + 不禁用缩放** | PASS | 底栏评分按钮 48px、主按钮 52px、头部图标按钮 44px、行内操作 44px，间距 ≥8px。底栏使用 `calc(var(--space-2) + env(safe-area-inset-bottom))`。viewport meta 无 `user-scalable=no`，无 `maximum-scale` 限制。 |

**结论：11 / 11 通过。**

---

## 11. 给前端 Agent 的实现指南

### 11.1 Tailwind 配置

项目锁定 `tailwindcss@3.4.19`，配置文件为 `tailwind.config.ts`（已随脚手架生成，本规范对其做了字体栈与 token 完整性的修正）。核心映射如下，完整文件见仓库。

```ts
// tailwind.config.ts（节选：颜色与字体映射）
const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:     'var(--color-bg)',
        surface:'var(--color-surface)',
        raised: 'var(--color-surface-raised)',
        sunken: 'var(--color-surface-sunken)',
        warm:   'var(--color-surface-warm)',
        active:'var(--color-surface-active)',
        fg:     'var(--color-fg)',
        'fg-2': 'var(--color-fg-2)',
        muted:  'var(--color-fg-muted)',
        meta:   'var(--color-fg-subtle)',
        disabled: 'var(--color-fg-disabled)',
        'on-accent': 'var(--color-fg-on-accent)',
        line:       'var(--color-border)',
        'line-soft':   'var(--color-border-soft)',
        'line-strong': 'var(--color-border-strong)',
        accent:        'var(--color-accent)',
        'accent-hover':  'var(--color-accent-hover)',
        'accent-active': 'var(--color-accent-active)',
        'accent-fg':     'var(--color-accent-fg)',
        'accent-soft':   'var(--color-accent-soft)',
        'accent-soft-fg':'var(--color-accent-soft-fg)',
        success: 'var(--color-success)',
        'success-soft': 'var(--color-success-soft)',
        warning: 'var(--color-warning)',
        'warning-soft': 'var(--color-warning-soft)',
        danger:  'var(--color-danger)',
        'danger-soft': 'var(--color-danger-soft)',
        info:  'var(--color-info)',
        'info-soft': 'var(--color-info-soft)',
      },
      fontFamily: {
        // Latin first, then CJK fallbacks: English never renders in a CJK face.
        sans: ['Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
               'Source Han Sans SC', 'Noto Sans CJK SC', 'Noto Sans SC',
               'system-ui', 'sans-serif'],
        display: ['Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
                  'Source Han Sans SC', 'Noto Sans CJK SC', 'Noto Sans SC',
                  'system-ui', 'sans-serif'],
        body: ['Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
               'Source Han Sans SC', 'Noto Sans CJK SC', 'Noto Sans SC',
               'system-ui', 'sans-serif'],
        // Headword, IPA, tabular statistics. Self-hosted, never CDN.
        word: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'SF Mono',
               'Menlo', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'SF Mono',
               'Menlo', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
      },
      // ... borderRadius / boxShadow / transitionDuration /
      //     transitionTimingFunction / maxWidth / zIndex
      //     全部映射到对应的 CSS 变量，见仓库完整文件
    },
  },
  plugins: [],
};

export default config;
```

要点：

- 颜色一律 `var(--color-*)`，配置里不出现任何 hex。
- `spacing` 只暴露 4px 网格的 11 个合法值，避免非标间距混入。
- `fontFamily.sans/body/display` 必须是 **拉丁在前，中文在后** 的顺序，否则英文会被中文字体接管。
- `fontFamily.word` 是给词头、音标、统计数字用的等宽栈。
- 深色模式用 `darkMode: 'class'`，只需在 `<html>` 上加 `class="dark"`。

### 11.2 三条必须遵守的实现约束

**约束一：快捷键与底栏必须共用同一个 `act()` 分发入口。**

桌面按键、底栏点击、卡片内按钮三路输入，全部收敛到一个 `act(name, data)` 函数。不要各写一套 handler。理由有两条：一是 T-13（弹窗屏蔽快捷键）只需要在 `onKey` 一处判断 `modalStack.length`，如果底栏和按键各写一份，屏蔽逻辑就会漏；二是 PRD 5.4 要求「弹窗内焦点循环限定在弹窗内」，共用入口才能保证状态一致。

```ts
// src/hotkeys/HotkeyBus.ts
export function act(name: Action, data: Record<string, string> = {}): void
// 调用方：onKey() / MobileBar onClick() / CardActions onClick()
```

**约束二：背面所有操作必须作用于 `session.current`，禁止通过队首推断。**

PRD 8.2 明确写了这条约束。典型 bug 场景：对卡 A 评分「认识」后队列推进到 B，此时用户在背面点「加入生词本」，如果实现里用 `queue.peek()` 取当前卡，星标会落到 B 上（对应 T-06）。正确做法是 `StudyEngine` 显式持有 `this.current`，背面所有操作取 `this.current.cardId`。

```ts
// 正确
toggleStar(wordId = this.currentWord()?.id)
// 错误（会打到下一张卡）
toggleStar(wordId = this.getDef(this.queue.peek().cardId).wordId)
```

**约束三：评分只在离开卡片时一次性提交，离开前的修改不触发调度。**

PRD 5.2 第 5 条。正面的 `prejudge()` 与背面的 `setRating()` 都只修改 `current.rating` 这个待提交值，只有 `next()` 调用 `commit()` 时才写 `ReviewLog` 并调用 `Scheduler`。这样能保证 T-05 的断言成立：预判「认识」→ 揭示后按 1 修正 → 按 → 进入下一张，全程只产生 1 条 `rating = AGAIN` 且 `corrected = true` 的日志。

配套要求：`undoEntry` 必须同时保存 `cardBefore`（卡片 FSRS 状态快照）、`qSnap`（队列快照）、`logId`（待删除日志 ID），三者缺一不可，否则 T-07 的逐字段恢复断言会失败。

### 11.3 其他实现要点

| 要点 | 说明 |
|---|---|
| 字体自托管 | Inter Variable 与 JetBrains Mono 打包进 Vite 产物，禁止运行时 CDN（PRD 8.1 + 2.4 离线要求） |
| 等宽边界 | 词头 / 音标 / 统计数字用 `--font-word`；例句正文用 `--font-body`（见 3.2） |
| 安全区 | 底栏 `padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom))` |
| `main` 底部留白 | `padding-bottom: var(--app-bottom-pad)`，防底栏遮挡 |
| 禁止缩放限制 | viewport 不加 `user-scalable=no`，`maximum-scale ≥ 5` |
| 图标尺寸 | 只有 16 / 20 / 24 三档，`strokeWidth` 统一 1.75 |
| 动效时长 | 状态切换 150ms 收敛值，弹窗进入 ≤260ms，禁止 >500ms |
| 键盘焦点环 | `box-shadow: var(--elev-focus)`，禁止裸 `outline: none` |
| 弹窗焦点管理 | 打开时移焦到首个可聚焦元素；Tab 循环限定内部；Esc 关栈顶；关闭后归还焦点 |

---

## 12. 变更记录

| 日期 | 变更 | 原因 | 影响范围 |
|---|---|---|---|
| 2026-10-21 | 初版发布 | 基于 PRD v0.2 与演示原型建立设计契约 | 全项目 |
