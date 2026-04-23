import { ref } from 'vue'

const isDark = ref(true)

document.documentElement.classList.add('dark')

export function useTheme() {
  return {
    isDark,
    mode: ref<'dark'>('dark'),
    toggleTheme: () => {},
    setTheme: () => {},
  }
}
