import { ref, watch } from 'vue'

type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'nf-theme'

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')

function getSystemIsDark(): boolean {
  return prefersDark.matches
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'system') return getSystemIsDark()
  return mode === 'dark'
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

const storedMode = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? 'system'
const mode = ref<ThemeMode>(storedMode)
const isDark = ref(resolveIsDark(mode.value))

applyTheme(isDark.value)

watch(mode, (newMode) => {
  localStorage.setItem(STORAGE_KEY, newMode)
  isDark.value = resolveIsDark(newMode)
  applyTheme(isDark.value)
})

prefersDark.addEventListener('change', () => {
  if (mode.value === 'system') {
    isDark.value = getSystemIsDark()
    applyTheme(isDark.value)
  }
})

export function useTheme() {
  function toggleTheme() {
    if (mode.value === 'system') {
      mode.value = isDark.value ? 'light' : 'dark'
    } else {
      mode.value = isDark.value ? 'light' : 'dark'
    }
  }

  function setTheme(newMode: ThemeMode) {
    mode.value = newMode
  }

  return {
    isDark,
    mode,
    toggleTheme,
    setTheme,
  }
}
