# Design Tokens — CSS Custom Properties

Copy-paste ready for your root stylesheet.

## Elevation

```css
--nf-bg-base:      #020406;
--nf-bg-surface:   #080B10;
--nf-bg-elevated:  #0E121A;
--nf-bg-top:       #161C26;

--nf-bg-base-alpha:     rgba(2, 4, 6, 0.92);
--nf-bg-surface-alpha:  rgba(8, 11, 16, 0.88);
--nf-bg-elevated-alpha: rgba(14, 18, 26, 0.85);
--nf-bg-top-alpha:      rgba(22, 28, 38, 0.8);
```

## Text

```css
--nf-text-primary:   #E6EDF3;
--nf-text-secondary: #6B7D8E;
--nf-text-tertiary:  #4A5C6E;
--nf-text-hover:     #B0BEC5;
--nf-text-input:     #C0CDD8;
--nf-text-disabled:  #3A4A5C;
```

## Accent

```css
--nf-accent:       #00FF9F;
--nf-accent-hover: #33FFB3;
--nf-accent-muted: rgba(0, 255, 159, 0.06);
--nf-accent2:      #00E5FF;
```

## Borders

```css
--nf-border-invisible: rgba(255, 255, 255, 0.06);
--nf-border-subtle:    rgba(255, 255, 255, 0.08);
--nf-border-visible:   rgba(255, 255, 255, 0.12);
--nf-border-divider:   #0E121A;
```

## Glow

```css
--nf-glow-sm:      0 0 6px rgba(0, 255, 159, 0.25);
--nf-glow-md:      0 0 12px rgba(0, 255, 159, 0.3);
--nf-glow-lg:      0 0 20px rgba(0, 255, 159, 0.2), 0 0 40px rgba(0, 255, 159, 0.08);
--nf-glow-text:    0 0 8px rgba(0, 255, 159, 0.5);
--nf-glow-massive: 0 0 1px rgba(0, 255, 159, 0.8),
                   0 0 15px rgba(0, 255, 159, 0.2),
                   0 0 40px rgba(0, 255, 159, 0.08);
```

## Fonts

```css
--nf-font-display: 'Inter', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
--nf-font-mono:    'JetBrains Mono', 'Fira Code', monospace;
```

### Local hosting (recommended)

```ts
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/700.css'
```

### Font rendering

```css
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
}
```

## Semantic Colors

```css
--nf-danger:        #f87171;
--nf-danger-muted:  rgba(248, 113, 113, 0.12);
--nf-warning:       #fbbf24;
--nf-warning-muted: rgba(251, 191, 36, 0.12);
--nf-success:       #34d399;
--nf-success-muted: rgba(52, 211, 153, 0.12);
--nf-info:          #6B7D8E;
--nf-info-muted:    rgba(107, 125, 142, 0.08);
```

## Shadows

```css
--nf-shadow-sm:   0 2px 6px rgba(0, 0, 0, 0.3);
--nf-shadow-md:   0 4px 16px rgba(0, 0, 0, 0.4);
--nf-shadow-lg:   0 8px 32px rgba(0, 0, 0, 0.5);
--nf-shadow-glow: 0 0 15px rgba(0, 255, 159, 0.12);
```

## Scrollbar

```css
--nf-scrollbar:       rgba(255, 255, 255, 0.08);
--nf-scrollbar-hover: rgba(255, 255, 255, 0.14);
```

## Overlay

```css
--nf-loading-mask: rgba(2, 4, 6, 0.85);
--nf-overlay:      rgba(0, 0, 0, 0.65);
--nf-overlay-blur: rgba(0, 0, 0, 0.35);
```

## Micro-Grid

```css
--nf-grid-color: rgba(0, 255, 159, 0.03);
--nf-grid-size:  20px;
```

## CJK Letter-Spacing

| Context | Latin | CJK |
|---------|-------|-----|
| Page title | 0.08em | 0.08em |
| Section header | 0.06em | 0.08em |
| Subtitle | 0.04em | 0.06em |
| Body | 0.02em | 0.03em |
| Nano | 0.1em | 0.12em |
