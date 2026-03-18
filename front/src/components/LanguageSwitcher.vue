<template>
  <el-dropdown @command="handleCommand" trigger="click">
    <el-button text class="flex items-center gap-1.5 px-3 py-2 text-sm text-nf-text-secondary transition-colors hover:text-nf-accent">
      <el-icon><Operation /></el-icon>
      <span class="font-500">{{ currentLanguageLabel }}</span>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="zh-CN" :disabled="locale === 'zh-CN'">
          <span class="flex items-center gap-2 min-w-30">
            <span class="text-4.5">🇨🇳</span>
            <span>简体中文</span>
            <el-icon v-if="locale === 'zh-CN'" class="ml-auto text-nf-accent"><Check /></el-icon>
          </span>
        </el-dropdown-item>
        <el-dropdown-item command="en-US" :disabled="locale === 'en-US'">
          <span class="flex items-center gap-2 min-w-30">
            <span class="text-4.5">🇺🇸</span>
            <span>English</span>
            <el-icon v-if="locale === 'en-US'" class="ml-auto text-nf-accent"><Check /></el-icon>
          </span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Operation, Check } from '@element-plus/icons-vue'
import { changeLanguage, type Language } from '@/locales'
import { ElMessage } from 'element-plus'

const { locale } = useI18n()

const currentLanguageLabel = computed(() => {
  return locale.value === 'zh-CN' ? '中文' : 'EN'
})

const handleCommand = (lang: Language) => {
  if (lang === locale.value) return
  
  changeLanguage(lang)
  ElMessage.success({
    message: lang === 'zh-CN' ? '语言已切换为中文' : 'Language switched to English',
    duration: 2000
  })
  
  setTimeout(() => {
    location.reload()
  }, 500)
}
</script>
