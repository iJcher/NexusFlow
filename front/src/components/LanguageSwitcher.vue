<script setup lang="ts">
import type { Language } from '@/locales'
import { Check, Operation } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { changeLanguage } from '@/locales'

const { locale } = useI18n()

const currentLanguageLabel = computed(() => {
  return locale.value === 'zh-CN' ? '中文' : 'EN'
})

const { t } = useI18n()

function handleCommand(lang: Language) {
  if (lang === locale.value)
    return
  changeLanguage(lang)
  ElMessage.success({ message: t('common.languageSwitched'), duration: 2000 })
}
</script>

<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <el-button text class="flex items-center gap-1.5 px-3 py-2 text-sm text-nf-text-secondary transition-colors hover:text-nf-accent">
      <el-icon><Operation /></el-icon>
      <span class="font-500">{{ currentLanguageLabel }}</span>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="zh-CN" :disabled="locale === 'zh-CN'">
          <span class="min-w-30 flex items-center gap-2">
            <span class="text-4.5">🇨🇳</span>
            <span>简体中文</span>
            <el-icon v-if="locale === 'zh-CN'" class="ml-auto text-nf-accent"><Check /></el-icon>
          </span>
        </el-dropdown-item>
        <el-dropdown-item command="en-US" :disabled="locale === 'en-US'">
          <span class="min-w-30 flex items-center gap-2">
            <span class="text-4.5">🇺🇸</span>
            <span>English</span>
            <el-icon v-if="locale === 'en-US'" class="ml-auto text-nf-accent"><Check /></el-icon>
          </span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
