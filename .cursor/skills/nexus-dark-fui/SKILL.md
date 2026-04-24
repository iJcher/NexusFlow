---
name: nexus-dark-fui-system
description: >-
  NEXUS Dark FUI 完整设计协议。所有 UI 实现必须遵循此规范。
  涵盖：tokens、字体、状态、hover、组件模式、Element Plus 覆盖。
---

# NEXUS Dark FUI — Complete Design Protocol

> **Clarity is the product. Aesthetic emerges from structural precision, NOT decorative sci-fi.**

## §1 — Three Foundational Laws

### Law 1: Border-Driven State（核心法则）

状态变化必须通过 **border-color 变化** 表达，不是 background 填充。

| State    | Border                     | Background                 | Text      | Glow |
|----------|----------------------------|----------------------------|-----------|------|
| Default  | `rgba(255,255,255,0.06)`   | `transparent`              | `#8B9DB0` | —    |
| Hover    | `rgba(0,255,159,0.35)`     | `transparent`              | `#B0BEC5` | —    |
| Active   | `rgba(0,255,159,0.5)`      | `rgba(0,255,159,0.06)`     | `#00FF9F` | sm   |
| Focus    | `rgba(0,255,159,0.5)`      | `transparent`              | unchanged | ring |
| Disabled | `rgba(255,255,255,0.03)`   | `transparent`              | `#3A4A5C` | —    |

**Hover 边框必须肉眼可见变化** — 从白色 `0.06` 跳到绿色 `0.35`。如果视觉上无差异 → 违规，必须修复。

### Law 2: No Pure White, No Solid Fills

- 文本最亮: `#E6EDF3`（禁止 `#FFF`）
- 按钮/标签 hover 填充上限: `rgba(0,255,159,0.06)`（禁止纯色背景）

### Law 3: Readability is the Bottom Line（可读性底线，不可妥协）

- **最小字号: `12px`，禁止任何 <12px 文本**
- Body 正文最低: `#8B9DB0`（不是 `#6B7D8E`，那个只用于次要标签）
- `#4A5C6E` 仅限 placeholder/timestamp，禁止用于正文
- CJK font-weight 禁止 >500（暗底 700 糊墨）
- CJK Body `line-height: 1.75`，Latin Body `line-height: 1.6`

---

## §2 — Design Tokens

### Elevation（子元素永远比父元素亮，禁止反转）

```css
--nf-bg-base: #020406;           /* Void — page bg */
--nf-bg-surface: #080B10;        /* Floor — cards */
--nf-bg-elevated: #0E121A;       /* Panel — modals, sidebars */
--nf-bg-top: #161C26;            /* Float — tooltips, dropdowns */
--nf-bg-base-alpha: rgba(2,4,6,0.92);
--nf-bg-surface-alpha: rgba(8,11,16,0.88);
--nf-bg-elevated-alpha: rgba(14,18,26,0.85);
```

### Text（正文默认用 `--nf-text-body`，不是 secondary）

```css
--nf-text-primary: #E6EDF3;      /* 标题 */
--nf-text-body: #8B9DB0;         /* 正文 — 可读性最低线 */
--nf-text-secondary: #6B7D8E;    /* 次要标签 */
--nf-text-tertiary: #4A5C6E;     /* 仅 placeholder */
--nf-text-hover: #B0BEC5;        /* hover 态 */
--nf-text-input: #C0CDD8;        /* 输入框已填值 */
--nf-text-disabled: #3A4A5C;
```

### Accent & Semantic

```css
--nf-accent: #00FF9F;     --nf-accent-hover: #33FFB3;     --nf-accent-muted: rgba(0,255,159,0.06);
--nf-accent2: #00E5FF;
--nf-danger: #f87171;     --nf-danger-muted: rgba(248,113,113,0.12);
--nf-warning: #fbbf24;    --nf-warning-muted: rgba(251,191,36,0.12);
--nf-success: #34d399;    --nf-success-muted: rgba(52,211,153,0.12);
--nf-info: #6B7D8E;       --nf-info-muted: rgba(107,125,142,0.08);
```

### Borders（hover 必须用绿色调）

```css
--nf-border-invisible: rgba(255,255,255,0.06);   /* default */
--nf-border-subtle: rgba(255,255,255,0.08);
--nf-border-visible: rgba(255,255,255,0.12);
--nf-border-hover: rgba(0,255,159,0.35);          /* HOVER — 绿色 */
--nf-border-active: rgba(0,255,159,0.5);
```

### Glow & Shadows

```css
--nf-glow-sm: 0 0 6px rgba(0,255,159,0.25);
--nf-glow-md: 0 0 12px rgba(0,255,159,0.3);
--nf-glow-lg: 0 0 20px rgba(0,255,159,0.2), 0 0 40px rgba(0,255,159,0.08);
--nf-shadow-sm: 0 2px 6px rgba(0,0,0,0.3);
--nf-shadow-md: 0 4px 16px rgba(0,0,0,0.4);
--nf-shadow-lg: 0 8px 32px rgba(0,0,0,0.5);
```

### Fonts / Scrollbar / Overlay

```css
--nf-font-display: 'Inter','Noto Sans SC',system-ui,-apple-system,sans-serif;
--nf-font-mono: 'JetBrains Mono','Fira Code',monospace;
--nf-scrollbar: rgba(255,255,255,0.08);   --nf-scrollbar-hover: rgba(255,255,255,0.14);
--nf-overlay: rgba(0,0,0,0.65);           --nf-loading-mask: rgba(2,4,6,0.85);
--nf-grid-color: rgba(0,255,159,0.03);    --nf-grid-size: 20px;
```

---

## §3 — Typography

| Level | Size    | Weight | Spacing | LH        | Font    | Color     |
|-------|---------|--------|---------|-----------|---------|-----------|
| H1    | 20–24px | 600    | 0.08em  | 1.4       | Display | `#E6EDF3` |
| H2    | 16–18px | 500    | 0.06em  | 1.5       | Display | `#E6EDF3` |
| Body  | 14px    | 400    | 0.02em  | 1.6/1.75  | Display | `#8B9DB0` |
| Small | 12px    | 400    | 0.04em  | 1.5       | Display | `#8B9DB0` |
| Label | 12px    | 600    | 0.06em↑ | 1.3       | Display | `#6B7D8E` |
| Data  | 12–13px | 400    | 0.02em  | 1.4       | Mono    | `#8B9DB0` |

**禁止:** `<12px`, `>24px`, CJK `weight:700`, Body 用 `#6B7D8E` 或更暗色。

Font rendering: `html { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; font-feature-settings: 'cv02','cv03','cv04','cv11'; }`

---

## §4 — Hover 交互规范（必须遵守）

**所有可交互元素 hover 必须有明确边框颜色变化。** 通用模式：

```css
.interactive { border: 1px solid rgba(255,255,255,0.06); transition: border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease; }
.interactive:hover { border-color: rgba(0,255,159,0.35); }
```

### 各组件 Hover 映射

| 组件            | Default Border            | Hover Border                     |
|-----------------|--------------------------|----------------------------------|
| Card            | `rgba(255,255,255,0.06)` | `rgba(0,255,159,0.3)` + glow     |
| Button(ghost)   | `rgba(255,255,255,0.06)` | `rgba(0,255,159,0.35)`           |
| Button(primary) | `var(--nf-accent)`       | `var(--nf-accent-hover)` + glow↑ |
| Button(danger)  | `#f87171`                | `#fca5a5` + danger glow          |
| Input           | `rgba(255,255,255,0.06)` | `rgba(0,255,159,0.25)`           |
| Table Row       | `transparent`            | 左侧 `2px accent bar`            |
| Tag             | `rgba(accent,0.25)`      | `rgba(accent,0.45)`             |
| Tab Item        | `transparent`            | 底边 `rgba(255,255,255,0.08)`    |
| Select Option   | `transparent`            | bg `rgba(0,255,159,0.08)`        |

---

## §5 — Component Patterns

### Page bg · Card · Buttons · Tag · Input · Table · Tab · Dialog · Scrollbar

```css
/* Page */ .page { background: radial-gradient(circle,var(--nf-accent-muted) 0.5px,transparent 0.5px),var(--nf-bg-base); background-size:20px 20px; }

/* Card */
.card { background:var(--nf-bg-surface-alpha); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:20px; transition:border-color .2s ease,box-shadow .2s ease; }
.card:hover { border-color:rgba(0,255,159,0.3); box-shadow:var(--nf-glow-md); }

/* Primary btn */
.btn-primary { background:transparent; color:var(--nf-accent); border:1px solid var(--nf-accent); box-shadow:var(--nf-glow-sm); font-size:14px; font-weight:600; border-radius:6px; padding:8px 20px; }
.btn-primary:hover { color:var(--nf-accent-hover); border-color:var(--nf-accent-hover); background:rgba(0,255,159,0.06); box-shadow:var(--nf-glow-md); }

/* Ghost btn */
.btn-ghost { background:transparent; color:#8B9DB0; border:1px solid rgba(255,255,255,0.06); }
.btn-ghost:hover { border-color:rgba(0,255,159,0.35); color:#B0BEC5; }

/* Danger btn */
.btn-danger { background:transparent; color:#f87171; border:1px solid #f87171; }
.btn-danger:hover { border-color:#fca5a5; background:rgba(248,113,113,0.06); box-shadow:0 0 8px rgba(248,113,113,0.2); }

/* Tag */
.tag { font-size:12px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; padding:3px 10px; border-radius:9999px; background:transparent; border:1px solid rgba(0,255,159,0.25); color:var(--nf-accent); }
.tag:hover { border-color:rgba(0,255,159,0.45); }

/* Input */
.input { background:transparent; border:1px solid rgba(255,255,255,0.06); border-radius:8px; color:#C0CDD8; font-size:14px; padding:10px 14px; transition:border-color .15s ease,box-shadow .15s ease; }
.input:hover { border-color:rgba(0,255,159,0.25); }
.input:focus { border-color:rgba(0,255,159,0.5); box-shadow:0 0 0 3px rgba(0,255,159,0.06); outline:none; }

/* Table */
.table-header { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#6B7D8E; border-bottom:1px solid rgba(255,255,255,0.06); }
.table-row { border-bottom:1px solid rgba(255,255,255,0.03); color:#8B9DB0; font-size:14px; transition:all .15s ease; }
.table-row:hover { background:rgba(255,255,255,0.02); border-left:2px solid rgba(0,255,159,0.4); }

/* Tab */
.tab-item { padding:8px 20px; background:transparent; color:#8B9DB0; font-size:14px; transition:all .15s ease; }
.tab-item:hover { color:#B0BEC5; border-bottom:2px solid rgba(255,255,255,0.08); }
.tab-item.active { color:var(--nf-accent); background:rgba(0,255,159,0.04); box-shadow:inset 0 -2px 0 var(--nf-accent); }

/* Dialog */
.dialog { background:var(--nf-bg-elevated); border:1px solid rgba(255,255,255,0.08); border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.6); }
.dialog-title { color:#E6EDF3; font-size:16px; font-weight:600; letter-spacing:0.06em; }

/* Scrollbar */
::-webkit-scrollbar { width:4px; height:4px; }
::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:2px; }
::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,0.14); }
```

---

## §6 — Element Plus Dark Override

### 6.1 变量覆盖（html.dark 优先级）

```css
html.dark {
  --el-color-primary:#00FF9F; --el-color-primary-light-3:#0D3D2A; --el-color-primary-light-5:#0A2E20;
  --el-color-primary-light-7:#071F16; --el-color-primary-light-8:#051710; --el-color-primary-light-9:#030F0A;
  --el-color-primary-dark-2:#33FFB3;
  --el-color-success:#34d399; --el-color-warning:#fbbf24; --el-color-danger:#f87171; --el-color-info:#6B7D8E;
  --el-bg-color:#080B10; --el-bg-color-page:#020406; --el-bg-color-overlay:#0E121A;
  --el-fill-color:#0E121A; --el-fill-color-light:#161C26; --el-fill-color-lighter:rgba(255,255,255,0.06); --el-fill-color-blank:#080B10;
  --el-text-color-primary:#E6EDF3; --el-text-color-regular:#8B9DB0; --el-text-color-secondary:#6B7D8E;
  --el-text-color-placeholder:#4A5C6E; --el-text-color-disabled:#3A4A5C;
  --el-border-color:rgba(255,255,255,0.06); --el-border-color-light:rgba(255,255,255,0.08);
  --el-border-color-hover:rgba(0,255,159,0.35);
  --el-mask-color:rgba(0,0,0,0.65); --el-box-shadow:0 8px 32px rgba(0,0,0,0.5);
  --el-disabled-bg-color:#0E121A; --el-disabled-text-color:#3A4A5C;
  --el-font-family:'Inter','Noto Sans SC',system-ui,-apple-system,sans-serif; --el-font-size-base:14px;
}
```

**陷阱:** `light-3~9` 在 dark mode 被 EP 用作背景。必须用暗色，否则亮瞎眼。

### 6.2 组件属性覆盖（需 !important）

```css
/* Buttons → outline */
.el-button--primary { color:var(--nf-accent)!important; background:transparent!important; border-color:var(--nf-accent)!important; }
.el-button--primary:hover,.el-button--primary:focus { color:var(--nf-accent-hover)!important; background:rgba(0,255,159,0.06)!important; border-color:var(--nf-accent-hover)!important; box-shadow:var(--nf-glow-sm); }
.el-button--danger { color:#f87171!important; background:transparent!important; border-color:#f87171!important; }
.el-button--danger:hover { border-color:#fca5a5!important; background:rgba(248,113,113,0.06)!important; }

/* Tags → 透明底 */
.el-tag { background:transparent!important; }
.el-tag--primary,.el-tag--primary.el-tag--dark,.el-tag--primary.el-tag--plain { background:rgba(0,255,159,0.06)!important; border-color:rgba(0,255,159,0.25)!important; color:var(--nf-accent)!important; }

/* Input → hover 绿边 */
:deep(.el-input__wrapper) { background:transparent!important; border:1px solid rgba(255,255,255,0.06); box-shadow:none!important; transition:border-color .2s ease; }
:deep(.el-input__wrapper:hover) { border-color:rgba(0,255,159,0.25)!important; }
:deep(.el-input__wrapper.is-focus) { border-color:rgba(0,255,159,0.5)!important; box-shadow:0 0 0 3px rgba(0,255,159,0.06)!important; }
:deep(.el-input__inner) { color:#C0CDD8; font-size:14px; }
:deep(.el-input__inner::placeholder) { color:#4A5C6E; }

/* Checkbox/Radio/Switch */
.el-checkbox__inner,.el-radio__inner { background:transparent!important; border-color:rgba(255,255,255,0.08)!important; }
.el-checkbox__input.is-checked .el-checkbox__inner,.el-radio__input.is-checked .el-radio__inner { background:var(--nf-accent)!important; border-color:var(--nf-accent)!important; }
.el-switch.is-checked .el-switch__core { background:var(--nf-accent)!important; border-color:var(--nf-accent)!important; }
```

---

## §7 — Motion

- `0.15–0.2s ease` only, 禁止 bounce/spring
- 所有交互元素必须加 `transition: border-color 0.2s ease`
- Animated borders: 仅 hero/login，每屏最多 1 个
- `@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:0.01ms!important; transition-duration:0.01ms!important; } }`

---

## §8 — Quick Do's & Don'ts

**DO:** border-color 变化表达状态 · outline-only 按钮/标签 · 正文 `#8B9DB0`+ · 最小 `12px` · hover 绿色调边框 · CJK `0.06em+` · `@fontsource` 本地字体 · input hover 绿边

**DON'T:** ❌ 纯色填充按钮/标签 · ❌ `#FFFFFF` · ❌ CJK `700` · ❌ `>24px` · ❌ `<12px` · ❌ 正文 `#4A5C6E` · ❌ hover 无视觉差 · ❌ EP 默认蓝色泄漏

---

## §9 — Checklist（新页面/组件必检）

1. Root: `--nf-font-display` + micro-dot grid bg
2. Title: 20-24px `#E6EDF3` `0.08em`
3. Body: `#8B9DB0`+, ≥14px
4. Cards: surface-alpha bg + **hover 绿色边框 + glow**
5. Buttons: outline-only + **hover 边框色变化明显**
6. Tags: transparent bg + colored border, ≥12px
7. Table header: 12px uppercase `#6B7D8E`; body: 14px `#8B9DB0`
8. Inputs: transparent bg, **hover 绿色边框**, focus accent ring
9. **所有可交互元素: hover 前后边框颜色必须有肉眼可见变化**
10. CJK: no 700, spacing OK
11. EP: 无蓝色/纯色泄漏
12. 字号: 无 <12px
13. 对比度: 正文对暗背景清晰可读
