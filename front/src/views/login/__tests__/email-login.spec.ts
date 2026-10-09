import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import zh from '@/locales/zh-CN'
import LoginPage from '../index.vue'

const mocks = vi.hoisted(() => ({ sendEmailCode: vi.fn(), signIn: vi.fn(), push: vi.fn() }))
vi.mock('@/services/auth.service', () => ({ AuthService: { sendEmailCode: mocks.sendEmailCode } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ signIn: mocks.signIn }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
const challenge = { challengeId: 'challenge-one', expiresAt: '2026-10-06T12:10:00Z', retryAfter: 60 }
const mounted: VueWrapper[] = []
function page() {
  const wrapper = mount(LoginPage, { global: { plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } })] } })
  mounted.push(wrapper)
  return wrapper
}
function field(wrapper: VueWrapper, text: string) {
  const label = wrapper.findAll('label').find(item => item.text() === text)
  expect(label, `Accessible label ${text}`).toBeDefined()
  return wrapper.get(`input[id="${label!.attributes('for')}"]`)
}
function sendButton(wrapper: VueWrapper) {
  return wrapper.get('button[type="button"]')
}
async function send(wrapper: VueWrapper, email = 'test+tag@example.com') {
  await field(wrapper, '邮箱').setValue(email)
  await sendButton(wrapper).trigger('click')
  await flushPromises()
}

describe('p00 email login page contract (component, not SMTP proof)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    mocks.sendEmailCode.mockResolvedValue(challenge)
    mocks.signIn.mockResolvedValue({})
    mocks.push.mockResolvedValue(undefined)
  })
  afterEach(() => {
    mounted.splice(0).forEach(wrapper => wrapper.unmount())
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('requires email and exactly six numeric OTP characters before requests', async () => {
    const wrapper = page()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.findAll('[role="alert"]').length).toBeGreaterThanOrEqual(2)
    expect(mocks.signIn).not.toHaveBeenCalled()
    for (const email of ['', 'not-email', 'a@', 'a b@example.com']) {
      await field(wrapper, '邮箱').setValue(email)
      await sendButton(wrapper).trigger('click')
      expect(mocks.sendEmailCode).not.toHaveBeenCalled()
    }
    await send(wrapper)
    for (const code of ['', '12345', 'abcdef', '1234567']) {
      await field(wrapper, '验证码').setValue(code)
      await wrapper.get('form').trigger('submit')
      expect(mocks.signIn).not.toHaveBeenCalled()
    }
    expect(field(wrapper, '验证码').attributes('type')).toBe('password')
  })

  it('cannot login with a valid-looking code before requesting a challenge', async () => {
    const wrapper = page()
    await field(wrapper, '邮箱').setValue('test@example.com')
    await field(wrapper, '验证码').setValue('012345')
    await wrapper.get('form').trigger('submit')
    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).not.toBe('')
  })

  it('prevents concurrent sends and enforces the server-provided cooldown', async () => {
    const pending = deferred<typeof challenge>()
    mocks.sendEmailCode.mockReturnValue(pending.promise)
    const wrapper = page()
    await field(wrapper, '邮箱').setValue('test+tag@example.com')
    await sendButton(wrapper).trigger('click')
    await sendButton(wrapper).trigger('click')
    expect(mocks.sendEmailCode).toHaveBeenCalledExactlyOnceWith('test+tag@example.com')
    expect(sendButton(wrapper).attributes('disabled')).toBeDefined()
    pending.resolve({ ...challenge, retryAfter: 3 })
    await flushPromises()
    await sendButton(wrapper).trigger('click')
    expect(mocks.sendEmailCode).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(sendButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('clears OTP/challenge on email edit and refuses using the previous email challenge', async () => {
    const wrapper = page()
    await send(wrapper)
    await field(wrapper, '验证码').setValue('012345')
    await field(wrapper, '邮箱').setValue('other@example.com')
    expect((field(wrapper, '验证码').element as HTMLInputElement).value).toBe('')
    await field(wrapper, '验证码').setValue('012345')
    await wrapper.get('form').trigger('submit')
    expect(mocks.signIn).not.toHaveBeenCalled()
  })

  it('never binds a late send response to an edited email', async () => {
    const pending = deferred<typeof challenge>()
    mocks.sendEmailCode.mockReturnValue(pending.promise)
    const wrapper = page()
    await field(wrapper, '邮箱').setValue('old@example.com')
    await sendButton(wrapper).trigger('click')
    await field(wrapper, '邮箱').setValue('new@example.com')
    pending.resolve(challenge)
    await flushPromises()
    await field(wrapper, '验证码').setValue('012345')
    await wrapper.get('form').trigger('submit')
    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('shows SMTP/API errors, restores loading, and respects retryAfter on rejection', async () => {
    mocks.sendEmailCode.mockRejectedValue({ isAxiosError: true, response: { data: { errMsg: '服务繁忙', retryAfter: 2 } } })
    const wrapper = page()
    await send(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('服务繁忙')
    expect(sendButton(wrapper).attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(2000)
    expect(sendButton(wrapper).attributes('disabled')).toBeUndefined()
    mocks.sendEmailCode.mockResolvedValue(challenge)
    await sendButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('guards double submit and remembers only the email after successful login', async () => {
    const wrapper = page()
    await send(wrapper)
    await field(wrapper, '验证码').setValue('012345')
    await wrapper.get('input[type="checkbox"]').setValue(true)
    const pending = deferred<object>()
    mocks.signIn.mockReturnValue(pending.promise)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith({ email: 'test+tag@example.com', challengeId: 'challenge-one', code: '012345' })
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    pending.resolve({})
    await flushPromises()
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/studio')
    expect(localStorage.length).toBe(1)
    expect(localStorage.getItem('nf_remember_email')).toBe('test+tag@example.com')
    expect(sessionStorage.length).toBe(0)
    expect((field(wrapper, '验证码').element as HTMLInputElement).value).toBe('')
  })

  it('shows failed login and leaves the page usable without storing the OTP', async () => {
    mocks.signIn.mockRejectedValue({ isAxiosError: true, response: { data: { errMsg: '验证码无效' } } })
    const wrapper = page()
    await send(wrapper)
    await field(wrapper, '验证码').setValue('012345')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('验证码无效')
    expect(mocks.push).not.toHaveBeenCalled()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('restores remembered email only, removes legacy phone and clears interval on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    localStorage.setItem('nf_remember_email', 'remember@example.com')
    localStorage.setItem('nf_remember_phone', 'legacy-phone')
    const wrapper = page()
    await flushPromises()
    expect((field(wrapper, '邮箱').element as HTMLInputElement).value).toBe('remember@example.com')
    expect((field(wrapper, '验证码').element as HTMLInputElement).value).toBe('')
    expect(localStorage.getItem('nf_remember_phone')).toBeNull()
    await wrapper.get('input[type="checkbox"]').setValue(false)
    expect(localStorage.getItem('nf_remember_email')).toBeNull()
    const loginTimer = setIntervalSpy.mock.results[0].value
    wrapper.unmount()
    expect(clearIntervalSpy).toHaveBeenCalledWith(loginTimer)
    clearIntervalSpy.mockRestore()
    setIntervalSpy.mockRestore()
    mounted.splice(mounted.indexOf(wrapper), 1)
  })

  it('renders the email placeholder without i18n message compilation errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const wrapper = page()
      expect(field(wrapper, '邮箱').attributes('placeholder')).toBe('name@example.com')
      expect(consoleError).not.toHaveBeenCalled()
    }
    finally { consoleError.mockRestore() }
  })
})
