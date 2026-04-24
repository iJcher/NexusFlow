# Component Patterns

All components follow **Law 1: Border-Driven State**. Background stays transparent; state is expressed through border color and glow.

## Page Background

```css
.page {
  background:
    radial-gradient(circle, var(--nf-accent-muted) 0.5px, transparent 0.5px),
    var(--nf-bg-base);
  background-size: 20px 20px;
}
```

## Card

```css
.card {
  background: var(--nf-bg-surface-alpha);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 20px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.card:hover {
  border-color: rgba(0, 255, 159, 0.3);
  box-shadow: var(--nf-glow-md);
}
```

## Button (outline-only)

```css
.btn-primary {
  background: transparent;
  color: var(--nf-accent);
  border: 1px solid var(--nf-accent);
  box-shadow: var(--nf-glow-sm);
  font-weight: 600;
  letter-spacing: 0.04em;
  border-radius: 6px;
  padding: 8px 20px;
}
.btn-primary:hover {
  background: rgba(0, 255, 159, 0.06);
  box-shadow: var(--nf-glow-md);
}
.btn-primary:disabled {
  color: rgba(0, 255, 159, 0.35);
  border-color: rgba(0, 255, 159, 0.15);
  box-shadow: none;
}

.btn-ghost {
  background: transparent;
  color: #6B7D8E;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.btn-ghost:hover {
  border-color: rgba(255, 255, 255, 0.12);
  color: #B0BEC5;
}

.btn-danger {
  background: transparent;
  color: #f87171;
  border: 1px solid #f87171;
}
.btn-danger:hover {
  background: rgba(248, 113, 113, 0.06);
}
```

## Tag (pill, border-driven)

```css
.tag {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 9999px;
  background: transparent;
  border: 1px solid rgba(0, 255, 159, 0.25);
  color: var(--nf-accent);
}
.tag-danger {
  border-color: rgba(248, 113, 113, 0.25);
  color: #f87171;
}
.tag.is-selected {
  border-color: rgba(0, 255, 159, 0.5);
  background: rgba(0, 255, 159, 0.06);
}
```

## Tab / Segmented Control

```css
.tab-bar {
  display: flex;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  overflow: hidden;
}
.tab-item {
  padding: 8px 20px;
  background: transparent;
  border: none;
  border-right: 1px solid rgba(255, 255, 255, 0.04);
  color: #6B7D8E;
  transition: all 0.15s ease;
}
.tab-item:hover { color: #B0BEC5; }
.tab-item.active {
  color: var(--nf-accent);
  background: rgba(0, 255, 159, 0.04);
  box-shadow: inset 0 -2px 0 var(--nf-accent);
}
```

## Sidebar / Filter

```css
.filter-item {
  color: #6B7D8E;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.03em;
  border-radius: 6px;
  padding: 10px 12px;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}
.filter-item:hover {
  color: #B0BEC5;
  border-color: rgba(255, 255, 255, 0.06);
}
.filter-item.active {
  color: var(--nf-accent);
  border-color: rgba(0, 255, 159, 0.2);
  background: rgba(0, 255, 159, 0.04);
  box-shadow: inset 2px 0 0 var(--nf-accent);
}
```

## Dialog

```css
.dialog {
  background: var(--nf-bg-elevated);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}
.dialog-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  padding: 20px 24px 16px;
}
.dialog-title {
  color: #E6EDF3;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
```

## Input

```css
.input {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  color: #C0CDD8;
  font-size: 14px;
  letter-spacing: 0.02em;
  padding: 10px 14px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.input:hover { border-color: rgba(255, 255, 255, 0.12); }
.input:focus {
  border-color: rgba(0, 255, 159, 0.5);
  box-shadow: 0 0 0 3px rgba(0, 255, 159, 0.06);
  outline: none;
}
.input::placeholder { color: #4A5C6E; }
```

## Table

```css
.table-header {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #4A5C6E;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.table-row {
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  transition: background-color 0.1s ease;
}
.table-row:hover {
  background-color: rgba(255, 255, 255, 0.02);
}
```

## Scrollbar

```css
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.14); }
```

## Multi-Tiered Bloom (hero/login only)

```css
box-shadow:
  0 0 0 1px rgba(0, 255, 159, 0.08) inset,
  0 0 10px rgba(0, 255, 159, 0.15),
  0 0 30px rgba(0, 255, 159, 0.08),
  0 0 80px rgba(0, 255, 159, 0.04),
  0 0 160px rgba(0, 255, 159, 0.02);
```

## Animated Border (max 1 per viewport)

Use `conic-gradient` + `@property` + `mask-composite: exclude` for traveling energy streaks on login/hero pages.

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
