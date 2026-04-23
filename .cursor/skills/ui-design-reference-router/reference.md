# UI Reference Library

本文件收录 5 套可直接执行的 UI 参考规范。使用时只选 1 套主规范，避免混搭冲突。

---

## Reference 1：暗黑 UI（Layered Dark）

### 设计目标

Design a dark interface with layered depth.

### Color system

- Background layers:
  - base `#111111`
  - surface `#1c1c1c`
  - elevated `#252525`
- Border: `1px solid #2a2a2a`（所有卡片和面板）
- Text:
  - heading `#f1f5f9`
  - body `#94a3b8`
  - muted/caption `#475569`
- Accent: 单色，仅推荐
  - `#10b981`（emerald）或
  - `#3b82f6`（blue）
- Accent 只用于：
  - primary buttons
  - active nav items
  - focus rings
- Accent 禁止用于：
  - backgrounds
  - icons
  - decorative elements

### Rules

- No pure `#000000` background
- No pure `#ffffff` text
- No warm beige or brown tones（保持冷灰）
- No multiple accent colors
- Shadows: 用 subtle inward glow（`box-shadow inset`）替代投影
- 所有交互元素都要 hover：背景提亮约 10%

### Typography

- Font：Inter / SF Pro / system sans-serif
- Heading：`24px / 700`
- Body：`15px / 400`
- Caption：`12px / 400`
- Body line-height：`1.6`

---

## Reference 2：后台管理（Enterprise Admin）

### 设计目标

Design a professional admin dashboard with enterprise-grade clarity.

### Layout structure

- Left sidebar：fixed，宽 `240px`，背景 `#1e293b`
- Top navbar：高 `60px`，白底，`border-bottom #e5e7eb`
- Main content：背景 `#f8fafc`，内边距 `24px`

### Color system

- Primary：`#3b82f6`（仅按钮、链接、激活态）
- Semantic colors（低饱和 badge 背景）：
  - success：text `#059669`，bg `#d1fae5`
  - warning：text `#d97706`，bg `#fef3c7`
  - error：text `#dc2626`，bg `#fee2e2`
  - info：text `#2563eb`，bg `#dbeafe`
- Neutral scale：
  - `#111827 / #374151 / #6b7280 / #9ca3af / #e5e7eb / #f9fafb`
- 禁止把语义色用于大面积背景填充

### Component rules

- Cards：白底，`1px solid #e5e7eb`，`radius 8px`，`shadow-sm`
- Tables：
  - row `52px`
  - header `40px`
  - alternating rows：`transparent / #f9fafb`
- Buttons：
  - primary filled
  - secondary outlined
  - 禁止 gradient
- Form inputs：
  - border `#d1d5db`
  - focus ring `#3b82f6` + `2px offset`

### Typography

- Page title：`20px / 700`
- Section label：`11px / 600`，uppercase，`letter-spacing 0.08em`，`#6b7280`
- Table cell：`14px / 400`
- Caption/helper：`12px / 400`，`#9ca3af`

### Spacing rhythm

- Card padding：`24px`
- Section gap：`24px`
- Table row padding：`12px 16px`

### Table behavior

- Column headers：sticky，背景 `#f9fafb`，`border-bottom 2px solid #e5e7eb`
- Row hover：`#f1f5f9`
- Action column：固定宽度、右对齐、仅 icon buttons
- Status column：必须 badge，禁止 plain text

---

## Reference 3：期刊排版（Editorial / Magazine）

### 设计目标

Design with editorial / magazine typography aesthetic.
Typography is the primary visual element.

### Font system

- Display / Hero heading：Georgia / Playfair Display / EB Garamond（serif）
  - `64-80px`，`700`
- Section heading（h2）：同 serif，`40px / 700`
- Subheading（h3）：Inter / system sans-serif，`22px / 600`
- Body：Inter，`17px / 400`，`line-height 1.75`
- Caption / label：Inter，`12px / 400`，`letter-spacing 0.04em`，`#6b7280`
- Pull quote：serif italic，`28-32px`，左边线 `3px solid #111`，`padding-left 24px`

### Color palette

- Primary text：`#111111`
- Secondary text：`#4b4b4b`
- Muted text：`#777777`
- Background：`#ffffff` 或 `#fafafa`（纯净、无暖色）
- Accent：最多 1 个或不用
  - 推荐 `#c1121f`（muted red）或 `#1d3557`（inky blue）
- 禁止：
  - gradient backgrounds
  - rounded cards
  - colored section backgrounds
  - badges

### Layout

- Content column：max-width `720px`，居中
- Full-bleed sections：`100%` 宽，顶部/底部 >= `80px`
- Grid：图文交替始终左右布局，不堆叠
- Horizontal rules：`1px solid #e5e7eb`，用来替代卡片容器

### Spacing

- Section break：`padding-top 80-100px`
- Paragraph gap：`28px`
- 禁止紧凑排版导致呼吸感消失

### 期刊落地页附加（Modifier）

- Hero：全宽，headline + subline + single CTA，无背景图
- Feature list：3 列文本网格，icon 可选但极简（line icon）
- 保持 editorial 规则，不加色块或渐变

---

## Reference 4：深色玻璃拟态（Dark Glassmorphism）

### 设计目标

Design a dark glassmorphism UI with layered depth.

### Background

- 基础底色：`#0a0f1e`
- 必须使用深色 gradient mesh（radial）：
  - `radial-gradient(ellipse at 20% 10%, rgba(99,56,200,0.45) 0%, transparent 60%)`
  - `radial-gradient(ellipse at 80% 80%, rgba(14,80,196,0.4) 0%, transparent 60%)`
- 禁止在平面白底上做玻璃拟态

### Glass card system

- Card bg：`rgba(255, 255, 255, 0.06)`
- Card border：`1px solid rgba(255, 255, 255, 0.12)`
- Radius：`14-18px`
- `backdrop-filter: blur(16px)` 仅用于主容器层
- 不要所有元素都加 blur

### Text

- Primary：`rgba(255, 255, 255, 0.92)`
- Secondary：`rgba(255, 255, 255, 0.5)`
- Muted/caption：`rgba(255, 255, 255, 0.3)`
- 禁止暖色或偏黄文本

### Accent

- 单一 accent：
  - `#8b5cf6`（violet）或
  - `#818cf8`（indigo）
- 用于交互态、关键高亮、重点数据
- 禁止多彩装饰
- 语义色：
  - success `#34d399`
  - warning `#fbbf24`
  - error `#f87171`

### Rules

- 禁止在浅色背景上使用玻璃拟态
- 玻璃层级不超过 2 层（3 层可读性差）
- Icons：Lucide
  - inline `16px`
  - standalone `20px`
- 禁止 emoji icons
- 禁止文字渐变装饰

---

## Reference 5：极简 SaaS 落地页（Minimal SaaS Landing）

### 设计目标

Design a minimal SaaS product landing page.

### Background & layout

- Page background：纯 `#ffffff`
- 禁止浅灰底、暖白底、分区底色切换
- Section separators：仅 `1px solid #f1f5f9` horizontal rule
- Max content width：`1120px` 居中
- Section padding：垂直 >= `80px`

### Typography

- Font：Inter（`700/600/500/400`）
- Hero heading：`48-56px`，`700`，`letter-spacing -0.03em`，`#0f172a`
- Section heading：`28-32px`，`700`，`letter-spacing -0.02em`
- Body：`16-17px`，`400`，`line-height 1.65`，`#475569`
- Label/overline：`11px`，`600`，uppercase，`letter-spacing 0.1em`，`#2563eb`

### Color

- Primary：`#2563eb`
- Text dark：`#0f172a`
- Text mid：`#475569`
- Text light：`#94a3b8`
- Border：`#f1f5f9`
- 禁止 gradients、彩色分区、多彩 CTA

### Buttons

- Primary：
  - bg `#2563eb`
  - text white
  - radius `8px`
  - no gradient, no shadow
- Ghost：
  - text + icon only
  - no border, no background
- 每个 section 只允许 1 个 primary CTA

### Icons

- Lucide line icons only（`strokeWidth 1.5`）
- 规格：
  - feature cards `18px`
  - inline with text `16px`
- 颜色：随文本语境或 primary blue
- 禁止 emoji / filled / colorful icons

### Components

- Feature cards：
  - white bg
  - `1px border #f1f5f9`
  - `radius 10px`
  - `padding 24px`
- Icon container：
  - `36x36px`
  - bg `#eff6ff`
  - radius `8px`
  - icon `#2563eb`
- Navigation：
  - white bg
  - bottom border `1px #f1f5f9`
  - height `60px`
- Stats/proof bar：
  - bg `#f8fafc`
  - border-top `1px #f1f5f9`

### Rules

- No glassmorphism
- No dark sections（footer 可例外）
- 禁止 box-shadow，唯一例外：
  - `0 1px 3px rgba(0,0,0,0.06)`（仅交互元素）
- Hero 禁止背景图与渐变
