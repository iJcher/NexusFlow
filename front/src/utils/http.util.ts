import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import type { TApiResponse } from '@/types/ApiResponse{T}'
import axios from 'axios'
import { getCurrentLanguage } from '@/locales'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'
import { getAccessToken } from '@/utils/auth-session'

export class ApiError extends Error {
  constructor(public errCode: number, public errMsg: string, public requestId: string, public retryAfter?: number) {
    super(errMsg)
    this.name = 'ApiError'
  }
}

type ErrorBody = TApiResponse<unknown> & { retryAfter?: number }
type RetriableConfig = InternalAxiosRequestConfig & { retriedAuth?: boolean }

export class HttpUtil {
  private static instanceDic: Record<string, AxiosInstance> = {}
  static getInstance(baseURL: string = import.meta.env.VITE_API_BASE_URL || '/api'): AxiosInstance {
    if (!this.instanceDic[baseURL])
      this.instanceDic[baseURL] = this.create(baseURL)
    return this.instanceDic[baseURL]
  }

  private static create(baseURL: string): AxiosInstance {
    const instance = axios.create({ baseURL, withCredentials: true })
    instance.interceptors.request.use((config) => {
      const token = getAccessToken()
      if (token)
        config.headers.Authorization = `Bearer ${token}`
      config.headers['Accept-Language'] = getCurrentLanguage()
      config.headers['X-Language'] = getCurrentLanguage()
      return config
    })
    instance.interceptors.response.use(
      (response) => {
        const body = response.data as TApiResponse<unknown>
        if (body.errCode !== 0)
          throw new ApiError(body.errCode, body.errMsg, body.requestId || '')
        return response
      },
      async (error: AxiosError<ErrorBody>) => {
        if (error.response?.status === 401) {
          const config = error.config as RetriableConfig | undefined
          if (config && !config.retriedAuth) {
            config.retriedAuth = true
            try {
              const token = getAccessToken()
              if (!token || config.headers.Authorization === `Bearer ${token}`)
                await useAuthStore().refreshToken()
              if (getAccessToken())
                return await instance.request(config)
            }
            catch { /* Single bounded auth retry; never log tokens. */ }
          }
          void router.push('/login')
          throw new ApiError(401, '请重新登录', '')
        }
        const body = error.response?.data
        if (body)
          throw new ApiError(body.errCode, body.errMsg, body.requestId || '', body.retryAfter)
        throw error
      },
    )
    return instance
  }
}
