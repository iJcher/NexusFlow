import { createApp } from 'vue'
import 'virtual:uno.css'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
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
import './assets/main.css'

import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/auth'
import i18n from '@/locales'
import { pinia } from '@/plugins/pinia'

const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(i18n)

const authStore = useAuthStore()
authStore.init()

app.mount('#app')
