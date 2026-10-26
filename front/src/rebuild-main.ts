import { createApp, h } from 'vue'
import { createI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import { messages } from './features/studio/messages'
import { productMessages } from './features/studio/product/messages'
import { studioRouter } from './features/studio/product/router'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import './features/studio/assets/fonts/fonts.css'
import './features/studio/assets/base.css'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import './features/studio/product/product.scss'

const i18n = createI18n({ legacy: false, locale: localStorage.getItem('nf-studio-language') || 'zh-CN', fallbackLocale: 'zh-CN', messages: { 'zh-CN': { ...messages['zh-CN'], ...productMessages['zh-CN'] }, 'en-US': { ...messages['en-US'], ...productMessages['en-US'] } } })
const app = createApp({ render: () => h(RouterView) }).use(studioRouter).use(i18n)
void studioRouter.isReady().then(() => app.mount('#app'))
