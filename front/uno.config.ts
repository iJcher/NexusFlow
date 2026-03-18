import {
  defineConfig,
  presetUno,
  presetAttributify,
  presetIcons,
  transformerDirectives,
} from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
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
        base: '#0d1117',
        card: '#161b22',
        elevated: '#1c2128',
        border: '#21262d',
        'border-light': '#2f3336',
        'text-primary': '#e7e9ea',
        'text-secondary': '#8b949e',
        'text-muted': '#484f58',
        accent: '#00d4aa',
        accent2: '#00b4d8',
        header: '#0f1419',
      },
    },
  },
  shortcuts: {
    // Layout shortcuts
    'nf-page': 'min-h-full',
    'nf-page-header': 'flex justify-between items-center mb-6',
    'nf-page-title': 'm-0 text-6 font-600 text-nf-text-primary',

    // Gradient text (NexusFlow brand)
    'nf-gradient-text': 'bg-gradient-to-br from-[#00d4aa] to-[#00b4d8] bg-clip-text text-transparent',

    // Card
    'nf-card': 'bg-[rgba(22,27,34,0.8)] backdrop-blur-sm border border-nf-border rounded-3',

    // Flex helpers
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',

    // Context menu
    'nf-context-menu': 'fixed z-1000 bg-nf-card border border-nf-border rounded-2 shadow-lg py-1 min-w-40 select-none',
    'nf-context-menu-item': 'flex items-center px-4 py-2.5 cursor-pointer transition-all duration-200 text-sm text-nf-text-primary',

    // Toolbar
    'nf-toolbar': 'h-15 px-5 bg-nf-card border-b border-nf-border flex-between shrink-0',
    'nf-toolbar-group': 'flex items-center gap-3',

    // Chat avatar
    'nf-avatar': 'w-9 h-9 rounded-full flex-center shrink-0',

    // Panel
    'nf-panel': 'bg-nf-card border border-nf-border rounded-2',
  },
  safelist: [],
  preflights: [
    {
      getCSS: () => `
        :root {
          --nf-bg-base: #0d1117;
          --nf-bg-card: #161b22;
          --nf-bg-elevated: #1c2128;
          --nf-border: #21262d;
          --nf-border-light: #2f3336;
          --nf-text-primary: #e7e9ea;
          --nf-text-secondary: #8b949e;
          --nf-text-muted: #484f58;
          --nf-accent: #00d4aa;
          --nf-accent2: #00b4d8;
        }
      `,
    },
  ],
})
