import {
  defineConfig,
  presetUno,
  presetAttributify,
  presetIcons,
  transformerDirectives,
} from 'unocss'

export default defineConfig({
  presets: [
    presetUno({ dark: 'class' }),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/',
    }),
  ],
  transformers: [
    transformerDirectives(),
  ],
  theme: {
    colors: {
      nf: {
        base: 'var(--nf-bg-base)',
        card: 'var(--nf-bg-card)',
        elevated: 'var(--nf-bg-elevated)',
        muted: 'var(--nf-bg-muted)',
        border: 'var(--nf-border)',
        'border-light': 'var(--nf-border-light)',
        'text-primary': 'var(--nf-text-primary)',
        'text-secondary': 'var(--nf-text-secondary)',
        'text-muted': 'var(--nf-text-muted)',
        accent: 'var(--nf-accent)',
        'accent-hover': 'var(--nf-accent-hover)',
        accent2: 'var(--nf-accent2)',
      },
    },
  },
  shortcuts: {
    // Layout
    'nf-page': 'min-h-full',
    'nf-page-header': 'flex justify-between items-center mb-8',
    'nf-page-title': 'm-0 text-7.5 font-700 tracking-tight text-nf-text-primary',
    'nf-page-subtitle': 'mt-1 text-3.5 text-nf-text-secondary',

    // Spacing
    'nf-space-page': 'px-8 py-6',
    'nf-space-card': 'p-5',
    'nf-space-section': 'mb-8',

    // Typography
    'nf-text-display': 'text-7.5 font-700 tracking-tight',
    'nf-text-heading': 'text-5 font-600',
    'nf-text-body': 'text-3.5 leading-relaxed',
    'nf-text-caption': 'text-3 text-nf-text-muted',

    // Brand gradient text
    'nf-gradient-text': 'bg-gradient-to-br from-[var(--nf-accent)] to-[var(--nf-accent2)] bg-clip-text text-transparent',

    // Card
    'nf-card': 'bg-nf-card border border-nf-border rounded-3',

    // Flex helpers
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',

    // Context menu
    'nf-context-menu': 'fixed z-1000 bg-nf-elevated border border-nf-border-light rounded-2 shadow-lg py-1 min-w-40 select-none',
    'nf-context-menu-item': 'flex items-center px-4 py-2.5 cursor-pointer transition-all duration-150 text-sm text-nf-text-primary',

    // Toolbar
    'nf-toolbar': 'h-14 px-5 bg-nf-card border-b border-nf-border flex-between shrink-0',
    'nf-toolbar-group': 'flex items-center gap-3',

    // Chat avatar
    'nf-avatar': 'w-9 h-9 rounded-full flex-center shrink-0',

    // Panel
    'nf-panel': 'bg-nf-card border border-nf-border rounded-3',
  },
  safelist: [],
})
