---
name: nexus-dark-fui
description: >-
  Apply a pristine, professional dark-mode FUI (Fictional User Interface) design system
  with deep obsidian background, neon mint accent, dual-font typography, and glassmorphism.
  Use when building or restyling UI components with "dark tech", "FUI", "HUD", "cyber",
  "obsidian dark", "neon accent", or "NexusFlow dark theme" keywords.
---

# Nexus Dark FUI Design System

A professional, data-heavy dark-mode UI design for developer tools. Aesthetic: pristine cyber-tech HUD with functional clarity. NOT decorative sci-fi — every visual element serves a purpose.

## Core Philosophy

- **No pure white text** — use cool gray `#E6EDF3` for max readability on deep black
- **No solid fills on buttons** — outline-only with glow on hover
- **No heavy borders** — ultra-thin 1px lines, dark grey default, neon glow on interaction
- **Breathable Chinese typography** — increased letter-spacing for CJK headers

## Quick Reference

For complete design tokens, see [tokens.md](tokens.md).

## Color System

### Surface Layers (darkest → lightest)

| Token | Value | Usage |
|-------|-------|-------|
| `--nf-bg-base` | `#05070A` | Page background |
| `--nf-bg-card` | `#080B10` | Card / dialog background |
| `--nf-bg-elevated` | `#0E1218` | Elevated panels, popovers |
| `--nf-bg-muted` | `#161B24` | Disabled, muted areas |

### Text Hierarchy (3 layers)

| Layer | Color | Letter-spacing | Usage |
|-------|-------|----------------|-------|
| Primary | `#E6EDF3` | `0.06–0.08em` | Titles, card names, dialog titles |
| Secondary | `#6B7D8E` | `0.03–0.04em` | Subtitles, descriptions, form labels |
| Tertiary | `#4A5C6E` | `0.02em` | Timestamps, counts, placeholders |
| Hover | `#B0BEC5` | — | Interactive text hover state |

### Accent & Glow

| Token | Value |
|-------|-------|
| `--nf-accent` | `#00FF9F` (neon mint green) |
| `--nf-accent-hover` | `#33FFB3` |
| `--nf-glow-sm` | `0 0 6px rgba(0, 255, 159, 0.25)` |
| `--nf-glow-md` | `0 0 12px rgba(0, 255, 159, 0.3)` |
| `--nf-glow-lg` | `0 0 20px rgba(0, 255, 159, 0.2), 0 0 40px rgba(0, 255, 159, 0.08)` |

### Borders

| State | Color |
|-------|-------|
| Default | `#1A2030` |
| Divider | `#141A22` |
| Input/Light | `#1E2733` |
| Hover/Focus | `rgba(0, 255, 159, 0.4)` + glow |

## Typography

### Dual-Font System

```css
--nf-font-display: 'Inter', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
--nf-font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

**Rules:**
1. `Inter` + `Noto Sans SC` for ALL UI text (labels, titles, descriptions, buttons)
2. `JetBrains Mono` ONLY for: timestamps, numerical data, code snippets
3. Chinese headers: `letter-spacing: 0.06–0.08em` for "breathable" high-end feel
4. Latin body: `letter-spacing: 0.02–0.04em`

### Font Installation (local hosting via @fontsource)

```ts
// main.ts
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

### Font Rendering

```css
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

## Component Patterns

### Page Background (micro-dot grid)

```css
.page {
  background:
    radial-gradient(circle, rgba(0, 255, 159, 0.03) 0.5px, transparent 0.5px),
    #05070A;
  background-size: 20px 20px;
}
```

### Card

```css
.card {
  background: rgba(8, 11, 16, 0.5);
  border: 1px solid #1A2030;
  border-radius: 8px;
  padding: 20px;
  transition: all 0.3s ease;
}
.card:hover {
  border-color: rgba(0, 255, 159, 0.4);
  box-shadow: 0 0 16px rgba(0, 255, 159, 0.12), 0 0 32px rgba(0, 255, 159, 0.04);
}
```

### Outline Button (no solid fills)

```css
.btn-primary {
  background: transparent;
  color: var(--nf-accent);
  border: 1px solid var(--nf-accent);
  box-shadow: var(--nf-glow-sm);
  font-family: var(--nf-font-display);
  font-weight: 600;
  letter-spacing: 0.04em;
  border-radius: 4px;
  padding: 9px 22px;
}
.btn-primary:hover {
  background: rgba(0, 255, 159, 0.06);
  box-shadow: var(--nf-glow-md);
}

.btn-ghost {
  background: transparent;
  color: #6B7D8E;
  border: 1px solid #1E2733;
}
.btn-ghost:hover {
  border-color: rgba(0, 255, 159, 0.2);
  color: #B0BEC5;
}
```

### Tag (type indicator)

```css
.tag {
  font-family: var(--nf-font-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 3px;
  border: 1px solid;
  background: transparent;
}
/* Variants: adjust color + border-color with 0.25 alpha */
```

### Sidebar Filter

```css
.filter-item {
  color: #6B7D8E;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.03em;
  border-radius: 6px;
  padding: 10px 12px;
}
.filter-item:hover { color: #B0BEC5; }
.filter-item.active {
  color: var(--nf-accent);
  background: rgba(0, 255, 159, 0.04);
}
/* Active indicator: 2px left bar with glow */
```

### Dialog / Modal

```css
.dialog {
  background: #080B10;
  border: 1px solid #1E2733;
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.dialog-header {
  border-bottom: 1px solid #141A22;
}
.dialog-title {
  color: #E6EDF3;
  font-weight: 700;
  letter-spacing: 0.06em;
}
```

### Scrollbar

```css
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #1E2733; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #2A3544; }
```

### Input Fields (Element Plus override pattern)

```css
:deep(.el-input__wrapper) {
  background: transparent;
  border: 1px solid #1E2733;
  box-shadow: none !important;
}
:deep(.el-input__wrapper.is-focus) {
  border-color: var(--nf-accent);
  box-shadow: var(--nf-glow-sm) !important;
}
:deep(.el-input__inner) {
  font-family: var(--nf-font-display);
  color: #C0CDD8;
  letter-spacing: 0.02em;
}
:deep(.el-input__inner::placeholder) {
  color: #4A5C6E;
}
```

## Semantic Colors

| Purpose | Color | Muted |
|---------|-------|-------|
| Danger | `#f87171` | `rgba(248, 113, 113, 0.15)` |
| Warning | `#fbbf24` | `rgba(251, 191, 36, 0.15)` |
| Success | `#34d399` | `rgba(52, 211, 153, 0.15)` |
| Info | `#60a5fa` | `rgba(96, 165, 250, 0.15)` |

## Do's and Don'ts

**DO:**
- Use `var(--nf-*)` tokens — never hardcode colors outside this system
- Keep buttons outline-only with glow on interaction
- Use `radial-gradient` micro-dot grid for page backgrounds
- Reserve `JetBrains Mono` strictly for data/code/timestamps
- Increase `letter-spacing` for Chinese text in titles (0.06–0.08em)

**DON'T:**
- Use pure white `#FFFFFF` for text — always `#E6EDF3`
- Use solid color fills for buttons
- Use shadows heavier than the defined token scale
- Mix font families randomly — follow the dual-font rule
- Use `font-weight: 300` — minimum weight is `400`

## Applying to New Pages

1. Set page root to use micro-dot grid background
2. Apply `font-family: var(--nf-font-display)` at container level
3. Follow the 3-layer text hierarchy for all typography
4. Use outline-only buttons with glow states
5. Cards: dark semi-transparent bg + thin border + green glow on hover
6. Dialogs: `#080B10` bg + `#1E2733` border
7. Override Element Plus components via `:deep()` selectors
