import type { Config } from 'tailwindcss';

/**
 * 颜色与尺度一律走 CSS 变量（src/styles/design-tokens.css）。
 * 此处只做语义 token -> Tailwind 工具类的映射，不出现任何硬编码色值。
 *
 * 变量命名有两套：--color-*（本文件与 index.css 使用）与短名 --bg / --fg 等。
 * 短名在 CSS 中解析到 --color-*，两者不会漂移。新组件推荐用短名。
 */
const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        raised: 'var(--color-surface-raised)',
        sunken: 'var(--color-surface-sunken)',
        warm: 'var(--color-surface-warm)',
        active: 'var(--color-surface-active)',

        // Foreground
        fg: 'var(--color-fg)',
        'fg-2': 'var(--color-fg-2)',
        muted: 'var(--color-fg-muted)',
        meta: 'var(--color-fg-subtle)',
        disabled: 'var(--color-fg-disabled)',
        'on-accent': 'var(--color-fg-on-accent)',

        // Borders
        line: 'var(--color-border)',
        'line-soft': 'var(--color-border-soft)',
        'line-strong': 'var(--color-border-strong)',

        // Accent
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-active': 'var(--color-accent-active)',
        'accent-fg': 'var(--color-accent-fg)',
        'accent-soft': 'var(--color-accent-soft)',
        'accent-soft-fg': 'var(--color-accent-soft-fg)',

        // Status
        success: 'var(--color-success)',
        'success-soft': 'var(--color-success-soft)',
        warning: 'var(--color-warning)',
        'warning-soft': 'var(--color-warning-soft)',
        danger: 'var(--color-danger)',
        'danger-soft': 'var(--color-danger-soft)',
        info: 'var(--color-info)',
        'info-soft': 'var(--color-info-soft)',
      },
      borderColor: {
        DEFAULT: 'var(--color-border)',
      },
      fontFamily: {
        // Latin first, then CJK fallbacks: English never renders in a CJK face.
        sans: [
          'Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
          'Source Han Sans SC', 'Noto Sans CJK SC', 'Noto Sans SC',
          'system-ui', 'sans-serif',
        ],
        display: [
          'Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
          'Source Han Sans SC', 'Noto Sans CJK SC', 'Noto Sans SC',
          'system-ui', 'sans-serif',
        ],
        body: [
          'Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
          'Source Han Sans SC', 'Noto Sans CJK SC', 'Noto Sans SC',
          'system-ui', 'sans-serif',
        ],
        // Headword, IPA, tabular statistics. Self-hosted, never CDN.
        word: [
          'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'SF Mono',
          'Menlo', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace',
        ],
        mono: [
          'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'SF Mono',
          'Menlo', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace',
        ],
      },
      fontSize: {
        '2xs':  ['var(--text-2xs)', { lineHeight: 'var(--leading-snug)' }],
        xs:     ['var(--text-xs)',  { lineHeight: 'var(--leading-snug)' }],
        sm:     ['var(--text-sm)',  { lineHeight: 'var(--leading-snug)' }],
        base:   ['var(--text-base)',{ lineHeight: 'var(--leading-snug)' }],
        md:     ['var(--text-md)',  { lineHeight: 'var(--leading-body)' }],
        lg:     ['var(--text-lg)',  { lineHeight: 'var(--leading-body)' }],
        xl:     ['var(--text-xl)',  { lineHeight: 'var(--leading-tight)' }],
        '2xl':  ['var(--text-2xl)', { lineHeight: 'var(--leading-tight)' }],
        '3xl':  ['var(--text-3xl)', { lineHeight: 'var(--leading-display)' }],
        '4xl':  ['var(--text-4xl)', { lineHeight: 'var(--leading-display)' }],
      },
      fontWeight: {
        read:      'var(--font-weight-read)',
        emphasize: 'var(--font-weight-emphasize)',
        announce:  'var(--font-weight-announce)',
      },
      spacing: {
        1:  'var(--space-1)',   2:  'var(--space-2)',   3:  'var(--space-3)',
        4:  'var(--space-4)',   5:  'var(--space-5)',   6:  'var(--space-6)',
        8:  'var(--space-8)',   10: 'var(--space-10)', 12: 'var(--space-12)',
        16: 'var(--space-16)', 20: 'var(--space-20)',
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        ring:    'var(--elev-ring)',
        raised:  'var(--elev-raised)',
        overlay: 'var(--elev-overlay)',
        focus:   'var(--elev-focus)',
      },
      transitionDuration: {
        instant: 'var(--motion-instant)',
        fast:    'var(--motion-fast)',
        base:    'var(--motion-base)',
        slow:    'var(--motion-slow)',
      },
      transitionTimingFunction: {
        standard:   'var(--ease-standard)',
        decelerate: 'var(--ease-decelerate)',
      },
      maxWidth: {
        container: 'var(--container-max)',
      },
      zIndex: {
        header:    'var(--z-header)',
        mobilebar: 'var(--z-mobilebar)',
        scrim:     'var(--z-scrim)',
        modal:     'var(--z-modal)',
        toast:     'var(--z-toast)',
      },
    },
  },
  plugins: [],
};

export default config;
