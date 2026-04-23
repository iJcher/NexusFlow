<template>
  <div class="login-page">
    <div class="login-card">
      <!-- Header -->
      <h1 class="card-heading">{{ t('login.welcome') }}</h1>
      <p class="card-subtitle">{{ t('login.formSubtitle') }}</p>

      <!-- Form -->
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

        <div class="form-extras">
          <el-checkbox v-model="rememberMe" class="remember-check">
            {{ t('login.rememberMe') }}
          </el-checkbox>
          <a href="javascript:void(0)" class="forgot-link">{{ t('login.forgotPassword') }}</a>
        </div>

        <el-form-item class="submit-row">
          <button
            type="submit"
            class="login-btn"
            :disabled="loading"
          >
            <span v-if="!loading">{{ t('login.loginBtn') }}</span>
            <span v-else class="btn-loading">
              <el-icon class="is-loading"><Loading /></el-icon>
              {{ t('login.loggingIn') }}
            </span>
          </button>
        </el-form-item>
      </el-form>

      <!-- Divider -->
      <div class="divider">
        <span class="divider-text">{{ t('login.orContinueWith') }}</span>
      </div>

      <!-- Social login -->
      <div class="social-row">
        <button class="social-btn" title="Google">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
        </button>
        <button class="social-btn" title="GitHub">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
        </button>
        <button class="social-btn" title="Microsoft">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z"/></svg>
        </button>
        <button class="social-btn" title="Apple">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
        </button>
      </div>

      <!-- Register link -->
      <p class="register-hint">
        {{ t('login.noAccount') }}
        <a href="javascript:void(0)" class="register-link">{{ t('login.register') }}</a>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { withLoading } from '@/utils/decorator.util'
import { Loading } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const rememberMe = ref(false)

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
/* ── Page ── */
.login-page {
  height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    url('@/assets/images/login-bg.png') center / cover no-repeat,
    #05070A;
  position: relative;
  overflow: hidden;
  font-family: var(--nf-font-display);
}

.login-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(5, 7, 10, 0.45);
  pointer-events: none;
}

/* ── Card — matte black, massive green atmosphere ── */
.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 380px;
  padding: 40px 32px 32px;
  border-radius: 16px;
  background: linear-gradient(
    165deg,
    rgba(10, 13, 18, 0.97) 0%,
    rgba(6, 8, 12, 0.98) 100%
  );
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1.5px solid rgba(0, 255, 159, 0.25);
  box-shadow:
    0 0 0 1px rgba(0, 255, 159, 0.06) inset,
    0 0 20px rgba(0, 255, 159, 0.12),
    0 0 60px rgba(0, 255, 159, 0.08),
    0 0 120px rgba(0, 255, 159, 0.05),
    0 0 200px rgba(0, 255, 159, 0.03),
    0 30px 80px rgba(0, 0, 0, 0.6);
}

/*
 * ── Ambient atmosphere layer ──
 * Massive diffused green radial glow expanding beyond the card.
 */
.login-card::before {
  content: '';
  position: absolute;
  inset: -80px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse 55% 55% at 50% 50%,
    rgba(0, 255, 159, 0.06) 0%,
    rgba(0, 255, 159, 0.03) 35%,
    transparent 70%
  );
  pointer-events: none;
  z-index: -1;
}

/*
 * ── Bottom-right corner glint ──
 * Localized prismatic flash point pulsing on the corner edge.
 */
.login-card::after {
  content: '';
  position: absolute;
  bottom: -1px;
  right: 24px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 50%,
    rgba(255, 255, 255, var(--glint-peak, 0)) 0%,
    rgba(200, 255, 230, var(--glint-mid, 0)) 15%,
    rgba(0, 255, 159, var(--glint-outer, 0)) 40%,
    transparent 70%
  );
  filter: blur(1px);
  animation: cornerGlint 2.4s ease-in-out infinite;
  pointer-events: none;
  z-index: 2;
}

@property --glint-peak {
  syntax: '<number>';
  initial-value: 0;
  inherits: false;
}

@property --glint-mid {
  syntax: '<number>';
  initial-value: 0;
  inherits: false;
}

@property --glint-outer {
  syntax: '<number>';
  initial-value: 0;
  inherits: false;
}

@keyframes cornerGlint {
  0%, 100% {
    --glint-peak: 0;
    --glint-mid: 0;
    --glint-outer: 0;
    filter: blur(1px);
  }
  /* Sharp flash-in */
  42% {
    --glint-peak: 0;
    --glint-mid: 0;
    --glint-outer: 0;
    filter: blur(1px);
  }
  46% {
    --glint-peak: 0.95;
    --glint-mid: 0.6;
    --glint-outer: 0.35;
    filter: blur(0px);
  }
  50% {
    --glint-peak: 0.3;
    --glint-mid: 0.15;
    --glint-outer: 0.08;
    filter: blur(1px);
  }
  /* Second staccato pulse */
  54% {
    --glint-peak: 0.7;
    --glint-mid: 0.4;
    --glint-outer: 0.2;
    filter: blur(0px);
  }
  58% {
    --glint-peak: 0;
    --glint-mid: 0;
    --glint-outer: 0;
    filter: blur(1px);
  }
}

.login-card > * {
  position: relative;
  z-index: 3;
}

/* ── Heading ── */
.card-heading {
  font-size: 26px;
  font-weight: 700;
  color: #E6EDF3;
  margin: 0 0 8px;
  letter-spacing: 0.06em;
}

.card-subtitle {
  font-size: 14px;
  color: #6B7D8E;
  margin: 0 0 32px;
  letter-spacing: 0.03em;
}

/* ── Form ── */
.login-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.login-form :deep(.el-input__wrapper) {
  padding: 6px 14px;
  height: 46px;
  background: rgba(14, 18, 24, 0.6);
  border: 1px solid #1E2733;
  border-radius: 10px;
  box-shadow: none !important;
  transition: all 0.2s ease;
}

.login-form :deep(.el-input__wrapper:hover) {
  border-color: #2A3544;
}

.login-form :deep(.el-input__wrapper.is-focus) {
  border-color: rgba(0, 255, 159, 0.5);
  box-shadow: 0 0 0 3px rgba(0, 255, 159, 0.08) !important;
}

.login-form :deep(.el-input__inner) {
  font-family: var(--nf-font-display);
  font-size: 14px;
  color: #C0CDD8;
  letter-spacing: 0.02em;
}

.login-form :deep(.el-input__inner::placeholder) {
  color: #4A5C6E;
}

.login-form :deep(.el-input__prefix .el-icon) {
  color: #4A5C6E;
  font-size: 16px;
}

/* ── Extras row ── */
.form-extras {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.remember-check {
  --el-checkbox-text-color: #6B7D8E;
  --el-checkbox-font-size: 13px;
}

:deep(.remember-check .el-checkbox__inner) {
  background: transparent;
  border-color: #2A3544;
  border-radius: 4px;
  width: 16px;
  height: 16px;
}

:deep(.remember-check .el-checkbox__inner:hover) {
  border-color: #4A5C6E;
}

:deep(.remember-check.is-checked .el-checkbox__inner) {
  background: var(--nf-accent);
  border-color: var(--nf-accent);
}

:deep(.remember-check .el-checkbox__label) {
  font-family: var(--nf-font-display);
  color: #6B7D8E;
  font-size: 13px;
  letter-spacing: 0.02em;
}

.forgot-link {
  font-size: 13px;
  color: #6B7D8E;
  text-decoration: none;
  letter-spacing: 0.02em;
  transition: color 0.15s;
}

.forgot-link:hover {
  color: #E6EDF3;
}

/* ── Submit button ── */
.submit-row {
  margin-bottom: 0 !important;
}

.login-btn {
  width: 100%;
  height: 46px;
  border: 1px solid var(--nf-accent);
  border-radius: 8px;
  background: transparent;
  color: var(--nf-accent);
  font-family: var(--nf-font-display);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: var(--nf-glow-sm);
}

.login-btn:hover {
  background: rgba(0, 255, 159, 0.06);
  box-shadow: var(--nf-glow-md);
}

.login-btn:active {
  transform: scale(0.98);
  box-shadow: var(--nf-glow-lg);
}

.login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-loading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--nf-accent);
}

/* ── Divider ── */
.divider {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 28px 0;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #1A2030;
}

.divider-text {
  font-size: 12px;
  color: #4A5C6E;
  white-space: nowrap;
  letter-spacing: 0.04em;
}

/* ── Social buttons ── */
.social-row {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 28px;
}

.social-btn {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid #1E2733;
  background: rgba(14, 18, 24, 0.5);
  color: #6B7D8E;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.social-btn:hover {
  border-color: rgba(0, 255, 159, 0.3);
  color: #E6EDF3;
  background: rgba(0, 255, 159, 0.04);
}

/* ── Register hint ── */
.register-hint {
  text-align: center;
  font-size: 13px;
  color: #4A5C6E;
  margin: 0;
  letter-spacing: 0.02em;
}

.register-link {
  color: var(--nf-accent);
  font-weight: 600;
  text-decoration: none;
  margin-left: 4px;
  transition: all 0.15s;
}

.register-link:hover {
  color: var(--nf-accent-hover);
  text-shadow: var(--nf-glow-text);
}

/* ── Error ── */
:deep(.el-form-item__error) {
  font-family: var(--nf-font-display);
  color: var(--nf-danger);
  font-size: 12px;
}

/* ── Responsive ── */
@media (max-width: 480px) {
  .login-card {
    margin: 16px;
    padding: 28px 24px;
    border-radius: 12px;
  }

  .card-heading {
    font-size: 22px;
  }
}
</style>
