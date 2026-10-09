<script setup lang="ts">
import type { EmailChallenge } from '@/types/auth.types'
import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { AuthService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const formData = reactive({ email: '', code: '' })
const rememberEmail = ref(false)
const sending = ref(false)
const loading = ref(false)
const emailError = ref('')
const codeError = ref('')
const requestError = ref('')
const notice = ref('')
const challenge = ref<EmailChallenge | null>(null)
const retryAt = ref(0)
const now = ref(Date.now())
const emailInput = ref<HTMLInputElement>()
const codeInput = ref<HTMLInputElement>()
let interval: ReturnType<typeof setInterval> | undefined
let emailRevision = 0
const rememberKey = 'nf_remember_email'
const emailPattern = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/
const unsafeEmailPattern = /[\r\n\0]/
const codePattern = /^\d{6}$/
const remaining = computed(() => Math.max(0, Math.ceil((retryAt.value - now.value) / 1000)))

function validateEmail(): boolean {
  const email = formData.email.trim()
  emailError.value = !email
    ? t('login.emailRequired')
    : email.length > 254 || !emailPattern.test(email) || unsafeEmailPattern.test(email)
      ? t('login.emailInvalid')
      : ''
  return !emailError.value
}

function validateCode(): boolean {
  codeError.value = !formData.code
    ? t('login.codeRequired')
    : !codePattern.test(formData.code) ? t('login.codeInvalid') : ''
  return !codeError.value
}

function showFailure(error: unknown) {
  if (axios.isAxiosError<{ errMsg?: string, retryAfter?: number }>(error)) {
    requestError.value = error.response?.data?.errMsg || t('login.requestFailed')
    const retry = error.response?.data?.retryAfter
    if (typeof retry === 'number' && retry > 0)
      retryAt.value = Date.now() + retry * 1000
  }
  else {
    requestError.value = t('login.requestFailed')
  }
}

async function sendCode() {
  if (sending.value || loading.value || remaining.value > 0)
    return
  requestError.value = ''
  notice.value = ''
  if (!validateEmail()) {
    emailInput.value?.focus()
    return
  }
  const email = formData.email.trim()
  const revision = emailRevision
  sending.value = true
  try {
    const result = await AuthService.sendEmailCode(email)
    if (revision !== emailRevision)
      return
    challenge.value = result
    retryAt.value = Date.now() + result.retryAfter * 1000
    now.value = Date.now()
    notice.value = t('login.codeSent')
    codeInput.value?.focus()
  }
  catch (error) {
    if (revision === emailRevision)
      showFailure(error)
  }
  finally { sending.value = false }
}

async function submit() {
  if (loading.value || sending.value)
    return
  requestError.value = ''
  const emailValid = validateEmail()
  const codeValid = validateCode()
  if (!emailValid || !codeValid) {
    if (!emailValid)
      emailInput.value?.focus()
    else codeInput.value?.focus()
    return
  }
  if (!challenge.value) {
    requestError.value = t('login.requestCodeFirst')
    return
  }
  loading.value = true
  try {
    await authStore.signIn({ email: formData.email.trim(), challengeId: challenge.value.challengeId, code: formData.code })
    if (rememberEmail.value)
      localStorage.setItem(rememberKey, formData.email.trim())
    else localStorage.removeItem(rememberKey)
    formData.code = ''
    await router.push('/studio')
  }
  catch (error) { showFailure(error) }
  finally { loading.value = false }
}

watch(() => formData.email, () => {
  emailRevision += 1
  challenge.value = null
  formData.code = ''
  emailError.value = ''
  codeError.value = ''
  notice.value = ''
  requestError.value = ''
})
watch(rememberEmail, (value) => {
  if (!value)
    localStorage.removeItem(rememberKey)
})
onMounted(() => {
  localStorage.removeItem('nf_remember_phone')
  const remembered = localStorage.getItem(rememberKey)
  if (remembered) {
    formData.email = remembered
    rememberEmail.value = true
  }
  interval = setInterval(() => {
    now.value = Date.now()
  }, 500)
})
onBeforeUnmount(() => {
  if (interval)
    clearInterval(interval)
})
</script>

<template>
  <main class="login-page">
    <section class="login-card" aria-labelledby="login-title">
      <p class="brand-label">
        NEXUS<span aria-hidden="true"> / </span>FLOW
      </p>
      <header class="form__header">
        <h1 id="login-title" class="form__title">
          {{ t('login.welcome') }}
        </h1>
        <p class="form__subtitle">
          {{ t('login.emailSubtitle') }}
        </p>
      </header>
      <form class="form login-form" novalidate @submit.prevent="submit">
        <div class="form__body">
          <div class="form__field">
            <label class="form__label" for="login-email">{{ t('login.email') }}</label>
            <input
              id="login-email" ref="emailInput" v-model="formData.email" class="input"
              type="email" name="email" autocomplete="email" inputmode="email"
              :placeholder="t('login.emailPlaceholder')" maxlength="254"
              :disabled="loading" :aria-invalid="!!emailError"
              :aria-describedby="emailError ? 'email-error' : undefined" @blur="validateEmail"
            >
            <p v-if="emailError" id="email-error" class="form__field-error" role="alert">
              {{ emailError }}
            </p>
          </div>
          <div class="form__field">
            <label class="form__label" for="login-code">{{ t('login.code') }}</label>
            <div class="code-row">
              <input
                id="login-code" ref="codeInput" v-model="formData.code" class="input"
                type="password" name="code" inputmode="numeric" autocomplete="one-time-code"
                :placeholder="t('login.codePlaceholder')" maxlength="6"
                :disabled="loading" :aria-invalid="!!codeError"
                :aria-describedby="codeError ? 'code-error' : undefined" @blur="validateCode"
              >
              <button class="send-code" type="button" :disabled="sending || loading || remaining > 0" @click="sendCode">
                {{ sending ? t('login.sendingCode') : remaining ? t('login.resendAfter', { seconds: remaining }) : t('login.sendCode') }}
              </button>
            </div>
            <p v-if="codeError" id="code-error" class="form__field-error" role="alert">
              {{ codeError }}
            </p>
          </div>
          <label class="remember-row">
            <input v-model="rememberEmail" type="checkbox" name="rememberEmail">
            <span>{{ t('login.rememberEmail') }}</span>
          </label>
          <p v-if="notice" class="form__notice" role="status">
            {{ notice }}
          </p>
          <p v-if="requestError" class="form__error-banner" role="alert">
            {{ requestError }}
          </p>
          <button type="submit" class="login-btn" :disabled="loading || sending" :aria-busy="loading">
            {{ loading ? t('login.loggingIn') : t('login.loginBtn') }}
          </button>
        </div>
      </form>
      <p class="form__hint">
        {{ t('login.emailHint') }}
      </p>
    </section>
  </main>
</template>

<style src="../../assets/email-login/fonts/fonts.css"></style>

<style scoped src="../../assets/email-login/base.css"></style>

<style scoped>
.login-page {
  min-height: 100dvh;
  padding: var(--space-6);
  display: grid;
  place-items: center;
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  font-family: var(--font-heading-cn);
}
.login-card {
  width: min(100%, 460px);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-10) var(--space-8);
  background: var(--color-bg-raised);
  box-shadow: var(--shadow-card);
}
.brand-label {
  font: var(--weight-medium) var(--text-sm) var(--font-heading);
  letter-spacing: 0.18em;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-10);
}
.brand-label span {
  color: var(--color-accent-orange);
}
.form__title {
  font-family: var(--font-display-cn);
  font-weight: var(--weight-regular);
  font-size: var(--text-3xl);
  line-height: var(--leading-cn-tight);
  margin-bottom: var(--space-3);
}
.form__subtitle {
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: var(--leading-cn-normal);
}
.form__body {
  display: grid;
  gap: var(--space-5);
  padding-block: var(--space-8);
}
.form__field {
  display: grid;
  gap: var(--space-2);
}
.form__label {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
}
.input {
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: var(--space-3);
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-overlay);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}
.input[aria-invalid='true'] {
  border-color: var(--color-error);
}
.input:focus-visible,
button:focus-visible,
.remember-row input:focus-visible {
  outline: 2px solid var(--color-accent-orange);
  outline-offset: 3px;
}
.code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
}
.send-code {
  min-height: 48px;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  cursor: pointer;
  font-size: var(--text-xs);
}
.remember-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}
.remember-row input {
  appearance: auto;
  width: 18px;
  height: 18px;
  accent-color: var(--color-accent-orange);
}
.login-btn {
  min-height: 48px;
  background: var(--color-accent-warm);
  color: var(--color-text-inverted);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-weight: var(--weight-medium);
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.form__field-error,
.form__error-banner {
  color: var(--color-error);
  font-size: var(--text-sm);
  line-height: var(--leading-cn-normal);
}
.form__notice,
.form__hint {
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  line-height: var(--leading-cn-normal);
}
@media (max-width: 480px) {
  .login-card {
    padding: var(--space-8) var(--space-6);
  }
  .code-row {
    grid-template-columns: 1fr;
  }
}
</style>
