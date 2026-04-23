# Nexus Dark FUI — Complete Design Tokens

Full CSS custom property reference. Copy this into your `variables.css` `:root` block.

## Surface Layers

```css
--nf-bg-base:      #05070A;
--nf-bg-card:      #080B10;
--nf-bg-elevated:  #0E1218;
--nf-bg-muted:     #161B24;

--nf-bg-base-alpha:     rgba(5, 7, 10, 0.85);
--nf-bg-card-alpha:     rgba(8, 11, 16, 0.85);
--nf-bg-elevated-alpha: rgba(14, 18, 24, 0.8);
--nf-bg-muted-alpha:    rgba(22, 27, 36, 0.6);
```

## Borders

```css
--nf-border:       #141A22;
--nf-border-light: #1E2733;
--nf-border-alpha: rgba(20, 26, 34, 0.5);
```

## Text

```css
--nf-text-primary:   #E6EDF3;
--nf-text-secondary: #a1a1aa;
--nf-text-muted:     #71717a;
```

### Component-Level Text Colors

| Role | Hex | Context |
|------|-----|---------|
| Title / Card name | `#E6EDF3` | Headers, dialog titles, card names |
| Subtitle / Description | `#6B7D8E` | Page subtitles, form labels, ghost buttons |
| Body description | `#7A8B9C` | Card descriptions, longer text |
| Tertiary / Placeholder | `#4A5C6E` | Timestamps, counts, input placeholders |
| Muted icon / Divider | `#3A4E5E` | Card-more icons, filter counts |
| Hover text | `#B0BEC5` | Filter hover, button hover |
| Input text | `#C0CDD8` | Input/textarea values |

## Accent

```css
--nf-accent:       #00FF9F;
--nf-accent-hover: #33FFB3;
--nf-accent-muted: rgba(0, 255, 159, 0.08);
--nf-accent2:      #00E5FF;
```

## Glow Effects

```css
--nf-glow-sm:   0 0 6px rgba(0, 255, 159, 0.25);
--nf-glow-md:   0 0 12px rgba(0, 255, 159, 0.3);
--nf-glow-lg:   0 0 20px rgba(0, 255, 159, 0.2), 0 0 40px rgba(0, 255, 159, 0.08);
--nf-glow-text: 0 0 8px rgba(0, 255, 159, 0.5);
```

## Font Stacks

```css
--nf-font-display: 'Inter', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
--nf-font-mono:    'JetBrains Mono', 'Fira Code', monospace;
```

## Micro-Grid

```css
--nf-grid-color: rgba(0, 255, 159, 0.03);
--nf-grid-size:  32px;
```

## Semantic Colors

```css
--nf-danger:       #f87171;
--nf-danger-muted: rgba(248, 113, 113, 0.15);
--nf-warning:      #fbbf24;
--nf-warning-muted: rgba(251, 191, 36, 0.15);
--nf-success:      #34d399;
--nf-success-muted: rgba(52, 211, 153, 0.15);
--nf-info:         #60a5fa;
--nf-info-muted:   rgba(96, 165, 250, 0.15);
```

## Scrollbar

```css
--nf-scrollbar:       #1E2733;
--nf-scrollbar-hover: #2A3544;
```

## Shadows

```css
--nf-shadow:      0 2px 8px rgba(0, 0, 0, 0.25);
--nf-shadow-md:   0 4px 16px rgba(0, 0, 0, 0.35);
--nf-shadow-lg:   0 8px 24px rgba(0, 0, 0, 0.45);
--nf-shadow-glow: 0 0 15px rgba(0, 255, 159, 0.15);
```

## Loading & Overlay

```css
--nf-loading-mask: rgba(5, 7, 10, 0.8);
--nf-overlay:      rgba(0, 0, 0, 0.6);
--nf-overlay-blur: rgba(0, 0, 0, 0.3);
```

## Element Plus Mapping

These values override Element Plus dark theme to match the FUI system:

```css
--el-font-family: 'Inter', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
--el-bg-color: #080B10;
--el-bg-color-page: #05070A;
--el-bg-color-overlay: #0E1218;
--el-fill-color: #0E1218;
--el-fill-color-light: #161B24;
--el-fill-color-lighter: #1E2733;
--el-fill-color-extra-light: #0E1218;
--el-fill-color-blank: #080B10;
--el-text-color-primary: #E6EDF3;
--el-text-color-regular: #E6EDF3;
--el-text-color-secondary: #a1a1aa;
--el-text-color-placeholder: #52525b;
--el-border-color: #141A22;
--el-border-color-light: #1E2733;
--el-border-color-lighter: #1E2733;
--el-border-color-extra-light: #141A22;
--el-color-primary: #00FF9F;
--el-color-primary-light-3: #33FFB3;
--el-color-primary-light-5: #66FFC6;
--el-color-primary-light-7: #99FFD9;
--el-color-primary-light-9: #E6FFF5;
--el-color-primary-dark-2: #00CC7F;
--el-mask-color: rgba(0, 0, 0, 0.6);
--el-box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
--el-box-shadow-light: 0 4px 16px rgba(0, 0, 0, 0.35);
--el-disabled-bg-color: #0E1218;
--el-disabled-text-color: #3A4A5C;
--el-disabled-border-color: #141A22;
```

## Letter-Spacing Reference

| Context | Value | Example Elements |
|---------|-------|------------------|
| Page title | `0.08em` | `.page-title` |
| Card name / Dialog title | `0.06em` | `.card-name`, `.dialog-title`, `.form-label` |
| Subtitle / Button | `0.04em` | `.page-subtitle`, `.btn` |
| Filter / Tab | `0.03em` | `.filter-item`, `.source-tab`, `.type-btn` |
| Body / Input / Description | `0.02em` | `.card-desc`, `.el-input__inner` |
| Sidebar label (uppercase) | `0.18em` | `.sidebar-label` |
| Tag | `0.06em` | `.tag` |
