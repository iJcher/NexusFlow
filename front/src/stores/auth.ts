import type { ISignInRequest, ITokenInfo } from '@/types/auth.types'
import { defineStore } from 'pinia'
import router from '@/router'
import { AuthService } from '@/services/auth.service'
import { setAuthSession } from '@/utils/auth-session'

let initializePromise: Promise<void> | null = null
let refreshPromise: Promise<ITokenInfo | null> | null = null
export const useAuthStore = defineStore('auth', {
  state: () => ({
    tokenInfo: null as ITokenInfo | null,
    refreshTimerId: null as ReturnType<typeof setTimeout> | null,
    initialized: false,
    sessionGeneration: 0,
  }),
  getters: {
    getIsAuthenticated: state => !!state.tokenInfo,
    getAccessToken: state => state.tokenInfo?.accessToken ?? null,
    getLoginUserInfo: state => state.tokenInfo
      ? { id: state.tokenInfo.user.id, name: state.tokenInfo.user.nickName, role: state.tokenInfo.user.role }
      : null,
    getLoginUserRole: state => state.tokenInfo?.user.role ?? null,
  },
  actions: {
    _setSession(value: ITokenInfo | null) {
      this.tokenInfo = value
      setAuthSession(value)
      localStorage.removeItem('tokenInfo')
      localStorage.removeItem('phoneNumber')
      if (this.refreshTimerId)
        clearTimeout(this.refreshTimerId)
      this.refreshTimerId = value
        ? setTimeout(() => { void this.refreshToken().catch(() => undefined) }, value.expiresIn * 800)
        : null
    },
    async signIn(data: ISignInRequest) {
      const generation = ++this.sessionGeneration
      refreshPromise = null
      const response = await AuthService.signIn(data)
      if (generation !== this.sessionGeneration)
        return null
      this._setSession(response.data || null)
      this.initialized = true
      return this.tokenInfo
    },
    async signOut() {
      ++this.sessionGeneration
      refreshPromise = null
      this._setSession(null)
      this.initialized = true
      try {
        await AuthService.signOut()
      }
      finally { await router.push('/login') }
    },
    async init() {
      await this.ensureSession()
    },
    async ensureSession() {
      if (this.initialized)
        return
      if (!initializePromise) {
        initializePromise = (async () => {
          try {
            await this.refreshToken()
          }
          catch { /* refreshToken owns generation-checked invalidation. */ }
          finally {
            this.initialized = true
          }
        })().finally(() => { initializePromise = null })
      }
      await initializePromise
    },
    async refreshToken(): Promise<ITokenInfo | null> {
      if (!refreshPromise) {
        const generation = this.sessionGeneration
        const request = (async () => {
          try {
            const response = await AuthService.refreshToken()
            if (generation !== this.sessionGeneration)
              return null
            this._setSession(response.data || null)
            return this.tokenInfo
          }
          catch (error) {
            if (generation === this.sessionGeneration)
              this._setSession(null)
            throw error
          }
        })()
        refreshPromise = request
        void request.finally(() => {
          if (refreshPromise === request)
            refreshPromise = null
        }).catch(() => undefined)
      }
      return refreshPromise
    },
  },
})
