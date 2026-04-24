<template>
  <div class="login-page">
    <div class="login-card">
      <div class="card-border-streak" aria-hidden="true" />
      <div class="card-corner-glint" aria-hidden="true" />

      <h1 class="card-heading">{{ t('login.welcome') }}</h1>
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

      <div class="divider">
        <span class="divider-text">{{ t('login.orContinueWith') }}</span>
      </div>

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

      <p class="register-hint">
        {{ t('login.noAccount') }}
        <a href="javascript:void(0)" class="register-link">{{ t('login.register') }}</a>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { withLoading } from '@/utils/decorator.util'
import { Loading } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'

const REMEMBER_KEY = 'nf_remember_phone'

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

onMounted(() => {
  const saved = localStorage.getItem(REMEMBER_KEY)
  if (saved) {
    formData.phoneNumber = saved
    rememberMe.value = true
  }
})

watch(rememberMe, (checked) => {
  if (!checked) {
    localStorage.removeItem(REMEMBER_KEY)
  }
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
      if (rememberMe.value) {
        localStorage.setItem(REMEMBER_KEY, formData.phoneNumber)
      } else {
        localStorage.removeItem(REMEMBER_KEY)
      }

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
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    url('@/assets/images/login-bg.png') center / cover no-repeat,
    #05070A;
  position: relative;
  overflow: auto;
  font-family: var(--nf-font-display);
  box-sizing: border-box;
  padding: 24px;
}

.login-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(5, 7, 10, 0.45);
  pointer-events: none;
}

/* ══════════════════════════════════════════
   Card — Multi-tiered Neon Bloom Border
   ══════════════════════════════════════════ */
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
  /* Tier 1: 2px sharp core border */
  border: 2px solid rgba(0, 255, 159, 0.45);
  /* Tier 2+3: inner glow (10px) + massive outer diffusion (40-200px) */
  box-shadow:
    0 0 0 1px rgba(0, 255, 159, 0.08) inset,
    0 0 10px rgba(0, 255, 159, 0.2),
    0 0 25px rgba(0, 255, 159, 0.12),
    0 0 50px rgba(0, 255, 159, 0.08),
    0 0 100px rgba(0, 255, 159, 0.05),
    0 0 200px rgba(0, 255, 159, 0.025),
    0 30px 80px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  box-sizing: border-box;
}

/* Micro-hexagonal grid texture overlay */
.login-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%2300ff9f' fill-opacity='0.03'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  opacity: 0.6;
  pointer-events: none;
  z-index: 1;
}

/* Glassmorphism highlight edge */
.login-card::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0, 255, 159, 0.15) 20%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(0, 255, 159, 0.15) 80%,
    transparent 100%
  );
  pointer-events: none;
  z-index: 2;
}

/* ── Traveling Energy Streak ──
   Orbiting light beam along the card perimeter */
.card-border-streak {
  position: absolute;
  inset: -2px;
  border-radius: 16px;
  padding: 2px;
  background: conic-gradient(
    from var(--streak-angle, 0deg) at 50% 50%,
    transparent 0deg,
    transparent 330deg,
    rgba(0, 255, 159, 0.15) 340deg,
    rgba(0, 255, 159, 0.4) 347deg,
    rgba(200, 255, 230, 0.7) 350deg,
    rgba(255, 255, 255, 0.85) 352deg,
    rgba(200, 255, 230, 0.7) 354deg,
    rgba(0, 255, 159, 0.4) 357deg,
    rgba(0, 255, 159, 0.15) 359deg,
    transparent 360deg
  );
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  animation: streakOrbit 3.5s linear infinite;
  pointer-events: none;
  z-index: 4;
}

@property --streak-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@keyframes streakOrbit {
  0%   { --streak-angle: 0deg; }
  100% { --streak-angle: 360deg; }
}

/* ── Bottom-right Specular Blade Glint ──
   Star-burst diffraction at the corner */
.card-corner-glint {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 32px;
  height: 32px;
  pointer-events: none;
  z-index: 5;
  animation: glintPulse 4s ease-in-out infinite;
}

/* Horizontal spike */
.card-corner-glint::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 28px;
  height: 2px;
  transform: translate(-50%, -50%) rotate(45deg);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0, 255, 159, 0.3) 20%,
    rgba(200, 255, 230, 0.8) 40%,
    rgba(255, 255, 255, 1) 50%,
    rgba(200, 255, 230, 0.8) 60%,
    rgba(0, 255, 159, 0.3) 80%,
    transparent 100%
  );
  border-radius: 1px;
}

/* Vertical spike — cross pattern */
.card-corner-glint::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 28px;
  transform: translate(-50%, -50%) rotate(45deg);
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(0, 255, 159, 0.3) 20%,
    rgba(200, 255, 230, 0.8) 40%,
    rgba(255, 255, 255, 1) 50%,
    rgba(200, 255, 230, 0.8) 60%,
    rgba(0, 255, 159, 0.3) 80%,
    transparent 100%
  );
  border-radius: 1px;
}

@keyframes glintPulse {
  0%, 100% {
    opacity: 0;
    transform: scale(0.5) rotate(0deg);
    filter: blur(1px);
  }
  /* Long dormant period */
  68% {
    opacity: 0;
    transform: scale(0.5) rotate(0deg);
    filter: blur(1px);
  }
  /* Flash in */
  72% {
    opacity: 1;
    transform: scale(1.2) rotate(8deg);
    filter: blur(0px);
  }
  /* Quick dim */
  76% {
    opacity: 0.2;
    transform: scale(0.8) rotate(4deg);
    filter: blur(0.5px);
  }
  /* Second staccato flash */
  79% {
    opacity: 0.9;
    transform: scale(1) rotate(-5deg);
    filter: blur(0px);
  }
  /* Fade out */
  85% {
    opacity: 0;
    transform: scale(0.6) rotate(0deg);
    filter: blur(1px);
  }
}

/* Card content z-index */
.login-card > *:not(.card-border-streak):not(.card-corner-glint):not([aria-hidden]) {
  position: relative;
  z-index: 3;
}

.card-heading,
.card-subtitle,
.login-form,
.divider,
.social-row,
.register-hint {
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
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
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
@media (max-width: 1024px) {
  .login-page {
    padding: 20px;
  }

  .login-card {
    max-width: 420px;
  }
}

@media (max-width: 768px) {
  .login-page {
    align-items: stretch;
    padding: 16px;
  }

  .login-card {
    margin: auto;
    max-width: 100%;
    padding: 32px 22px 22px;
  }

  .card-heading {
    font-size: 22px;
    letter-spacing: 0.05em;
  }

  .card-subtitle {
    margin-bottom: 24px;
  }

  .login-btn {
    height: 44px;
    font-size: 14px;
  }
}

@media (max-width: 480px) {
  .login-page {
    padding: 12px;
  }

  .login-card {
    margin: auto;
    padding: 24px 16px 18px;
    border-radius: 12px;
  }

  .card-heading {
    font-size: 20px;
  }

  .social-row {
    gap: 10px;
    margin-bottom: 20px;
  }

  .social-btn {
    width: 42px;
    height: 42px;
    border-radius: 10px;
  }
}

@media (max-width: 360px) {
  .login-page {
    padding: 10px;
  }

  .login-card {
    padding: 20px 12px 14px;
  }

  .card-subtitle {
    font-size: 13px;
  }

  .forgot-link,
  :deep(.remember-check .el-checkbox__label),
  .register-hint {
    font-size: 12px;
  }
}

@media (max-height: 760px) {
  .login-page {
    align-items: flex-start;
    padding-top: 16px;
    padding-bottom: 16px;
  }

  .login-card {
    margin: auto;
    padding-top: 24px;
    padding-bottom: 18px;
  }

  .divider {
    margin: 18px 0;
  }
}

@media (max-height: 620px) {
  .login-page {
    padding-top: 10px;
    padding-bottom: 10px;
  }

  .login-card {
    border-radius: 10px;
  }

  .card-border-streak,
  .card-corner-glint {
    display: none;
  }
}
</style>
