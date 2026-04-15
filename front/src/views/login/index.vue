<template>
  <div class="login-page">
    <div class="login-card">
      <div class="card-top-actions">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <div class="card-brand">
        <img src="@/assets/images/logo.png" alt="NexusFlow" class="card-logo" />
        <h1 class="card-title">
          <span class="brand-nexus">Nexus</span><span class="brand-flow">Flow</span>
        </h1>
      </div>

      <p class="card-subtitle">{{ t('login.formSubtitle') }}</p>

      <el-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        @submit.prevent="handleSubmit"
        class="login-form"
      >
        <el-form-item prop="phoneNumber">
          <el-input
            v-model="formData.phoneNumber"
            :placeholder="t('login.phonePlaceholder')"
            prefix-icon="User"
            size="large"
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="formData.password"
            type="password"
            :placeholder="t('login.passwordPlaceholder')"
            prefix-icon="Lock"
            show-password
            size="large"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            size="large"
            class="w-full font-600"
          >
            {{ loading ? t('login.loggingIn') : t('login.registerOrLogin') }}
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { withLoading } from '@/utils/decorator.util'
import ThemeToggle from '@/components/ThemeToggle.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import type { FormInstance, FormRules } from 'element-plus'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const formRef = ref<FormInstance>()
const loading = ref(false)

const formData = reactive({
  phoneNumber: '',
  password: '',
})

const rules = computed<FormRules>(() => ({
  phoneNumber: [
    { required: true, message: t('login.phoneRequired'), trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: t('login.phoneInvalid'), trigger: 'blur' },
  ],
  password: [
    { required: true, message: t('login.passwordRequired'), trigger: 'blur' },
    { min: 6, message: t('login.passwordMinLength'), trigger: 'blur' },
  ],
}))

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (valid) {
      await withLoading(
        async () => {
          const response = await authStore.signIn(formData.phoneNumber, formData.password)
          router.push('/')
          return response
        },
        loading,
        t('login.loginSuccess'),
      )
    }
  })
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 第二层背景的渐变可以青一点，然后蓝色更深一点 */
  background: url('@/assets/images/login-bg.jpeg') center / contain no-repeat, linear-gradient(160deg, #f0fdfa 0%, #e0f2fe 40%, #ecfeff 70%, #f0fdfa 100%);;
  position: relative;
}

.login-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
}

.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px;
  padding: 40px 36px;
  border-radius: 16px;
  background: var(--nf-bg-base-alpha, rgba(255, 255, 255, 0.12));
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--nf-border-alpha, rgba(255, 255, 255, 0.15));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}

.card-top-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 24px;
}

.card-brand {
  text-align: center;
  margin-bottom: 8px;
}

.card-logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  margin-bottom: 12px;
}

.card-title {
  font-family: 'DongFangDaKai', sans-serif;
  font-size: 32px;
  font-weight: 800;
  margin: 0;
  letter-spacing: 1px;
}

.brand-nexus {
  background: var(--nf-brand-nexus-gradient);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-flow {
  background: var(--nf-brand-flow-gradient);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.card-subtitle {
  text-align: center;
  font-size: 14px;
  color: var(--nf-text-secondary);
  margin: 0 0 28px;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.login-form :deep(.el-input__wrapper) {
  padding: 4px 12px;
  background: var(--nf-bg-base-alpha, rgba(255, 255, 255, 0.08));
  backdrop-filter: blur(4px);
}

:deep(.el-form-item__error) {
  color: var(--nf-danger);
}

@media (max-width: 480px) {
  .login-card {
    margin: 16px;
    padding: 28px 24px;
  }
}
</style>
