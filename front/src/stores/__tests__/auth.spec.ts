import type { ITokenInfo } from '@/types/auth.types'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessToken, setAuthSession } from '@/utils/auth-session'
import { useAuthStore } from '../auth'

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), refreshToken: vi.fn(), signOut: vi.fn(), push: vi.fn() }))
vi.mock('@/services/auth.service', () => ({ AuthService: mocks }))
vi.mock('@/router', () => ({ default: { push: mocks.push } }))

const token: ITokenInfo = {
  type: 'Bearer',
  accessToken: 'unit-only-access',
  expiresIn: 60,
  user: { id: 'u1', email: 'test@example.com', nickName: 'Test', role: 0 },
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
describe('p00 authentication store contract', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    setAuthSession(null)
    mocks.push.mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    setAuthSession(null)
  })
  it('passes the complete email challenge contract and removes legacy credentials', async () => {
    localStorage.setItem('tokenInfo', 'legacy-secret')
    localStorage.setItem('phoneNumber', 'legacy-phone')
    mocks.signIn.mockResolvedValue({ data: token })
    const store = useAuthStore()
    const input = { email: 'test@example.com', challengeId: 'challenge-1', code: '012345' }
    await store.signIn(input)
    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith(input)
    expect(store.getIsAuthenticated).toBe(true)
    expect(getAccessToken()).toBe(token.accessToken)
    expect(store.getLoginUserInfo).toEqual({ id: 'u1', name: 'Test', role: 0 })
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
  it('restores a page reload from the refresh cookie, single-flight', async () => {
    const request = deferred<{ data: ITokenInfo }>()
    mocks.refreshToken.mockReturnValue(request.promise)
    const store = useAuthStore()
    const first = store.ensureSession()
    const second = store.ensureSession()
    expect(mocks.refreshToken).toHaveBeenCalledTimes(1)
    request.resolve({ data: token })
    await Promise.all([first, second])
    expect(store.initialized).toBe(true)
    expect(store.getIsAuthenticated).toBe(true)
    await store.ensureSession()
    expect(mocks.refreshToken).toHaveBeenCalledTimes(1)
  })
  it('coalesces concurrent refresh operations', async () => {
    const request = deferred<{ data: ITokenInfo }>()
    mocks.refreshToken.mockReturnValue(request.promise)
    const store = useAuthStore()
    const first = store.refreshToken()
    const second = store.refreshToken()
    expect(mocks.refreshToken).toHaveBeenCalledTimes(1)
    request.resolve({ data: token })
    expect(await first).toEqual(token)
    expect(await second).toEqual(token)
  })
  it('clears access session and scheduled refresh when server rejects refresh', async () => {
    const store = useAuthStore()
    store._setSession(token)
    mocks.refreshToken.mockRejectedValue(new Error('expired'))
    await expect(store.refreshToken()).rejects.toThrow('expired')
    expect(store.getIsAuthenticated).toBe(false)
    expect(getAccessToken()).toBeNull()
    expect(store.refreshTimerId).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('allows anonymous initialization without unhandled failure or retry loop', async () => {
    mocks.refreshToken.mockRejectedValue(new Error('no refresh cookie'))
    const store = useAuthStore()
    await store.ensureSession()
    await store.ensureSession()
    expect(store.initialized).toBe(true)
    expect(store.getIsAuthenticated).toBe(false)
    expect(mocks.refreshToken).toHaveBeenCalledTimes(1)
  })
  it('logs out, cancels its timer and returns to the login route', async () => {
    const store = useAuthStore()
    store._setSession(token)
    mocks.signOut.mockResolvedValue(undefined)
    await store.signOut()
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(store.getIsAuthenticated).toBe(false)
    expect(getAccessToken()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/login')
  })
  it('does not revive a logged-out user when an earlier refresh resolves late', async () => {
    const store = useAuthStore()
    store._setSession(token)
    const refresh = deferred<{ data: ITokenInfo }>()
    mocks.refreshToken.mockReturnValue(refresh.promise)
    mocks.signOut.mockResolvedValue(undefined)
    const pending = store.refreshToken()
    await store.signOut()
    refresh.resolve({ data: token })
    await pending
    expect(store.getIsAuthenticated).toBe(false)
    expect(getAccessToken()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('clears the local session even when remote logout is unavailable', async () => {
    const store = useAuthStore()
    store._setSession(token)
    mocks.signOut.mockRejectedValue(new Error('network unavailable'))
    await expect(store.signOut()).rejects.toThrow('network unavailable')
    expect(store.getIsAuthenticated).toBe(false)
    expect(getAccessToken()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/login')
  })
  it('ignores an obsolete refresh failure after successful fresh login', async () => {
    const store = useAuthStore()
    const oldRefresh = deferred<{ data: ITokenInfo }>()
    mocks.refreshToken.mockReturnValue(oldRefresh.promise)
    const pending = store.refreshToken()
    const observedRejection = expect(pending).rejects.toThrow('old session expired')
    mocks.signIn.mockResolvedValue({ data: token })
    await store.signIn({ email: 'test@example.com', challengeId: 'new-challenge', code: '012345' })
    oldRefresh.reject(new Error('old session expired'))
    await observedRejection
    expect(store.getIsAuthenticated).toBe(true)
    expect(getAccessToken()).toBe(token.accessToken)
    expect(vi.getTimerCount()).toBe(1)
  })
  it('does not let startup refresh failure erase the login used by the route guard', async () => {
    const store = useAuthStore()
    const startup = deferred<{ data: ITokenInfo }>()
    mocks.refreshToken.mockReturnValue(startup.promise)
    const initializing = store.ensureSession()
    mocks.signIn.mockResolvedValue({ data: token })
    await store.signIn({ email: 'test@example.com', challengeId: 'challenge-1', code: '012345' })
    startup.reject(new Error('anonymous startup request rejected'))
    await initializing
    await store.ensureSession()
    expect(store.initialized).toBe(true)
    expect(store.getIsAuthenticated).toBe(true)
    expect(store.getAccessToken).toBe(token.accessToken)
    expect(mocks.refreshToken).toHaveBeenCalledTimes(1)
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it('does not replace a fresh login with an older startup refresh identity', async () => {
    const store = useAuthStore()
    const startup = deferred<{ data: ITokenInfo }>()
    mocks.refreshToken.mockReturnValue(startup.promise)
    const initializing = store.ensureSession()
    mocks.signIn.mockResolvedValue({ data: token })
    await store.signIn({ email: 'test@example.com', challengeId: 'challenge-1', code: '012345' })
    startup.resolve({ data: { ...token, accessToken: 'obsolete-unit-access', user: { ...token.user, id: 'obsolete-user' } } })
    await initializing
    expect(store.getAccessToken).toBe(token.accessToken)
    expect(store.getLoginUserInfo?.id).toBe('u1')
    expect(vi.getTimerCount()).toBe(1)
  })
  it('does not restore an in-flight login after the user logs out', async () => {
    const store = useAuthStore()
    const login = deferred<{ data: ITokenInfo }>()
    mocks.signIn.mockReturnValue(login.promise)
    mocks.signOut.mockResolvedValue(undefined)
    const signingIn = store.signIn({ email: 'test@example.com', challengeId: 'challenge-1', code: '012345' })
    await store.signOut()
    login.resolve({ data: token })
    expect(await signingIn).toBeNull()
    expect(store.getIsAuthenticated).toBe(false)
    expect(getAccessToken()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
