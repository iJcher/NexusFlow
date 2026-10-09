import type { TApiResponse } from '@/types/ApiResponse{T}'
import type { EmailChallenge, ISignInRequest, ITokenInfo, UserInfo } from '@/types/auth.types'
import axios from 'axios'
import { getAccessToken } from '@/utils/auth-session'

// Separate client avoids refresh→401 interceptor→refresh recursion.
const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api', withCredentials: true })
export class AuthService {
  static async sendEmailCode(email: string): Promise<EmailChallenge> {
    const response = await client.post<TApiResponse<EmailChallenge>>('/auth/email/code', { email })
    return response.data.data!
  }

  static async signIn(data: ISignInRequest): Promise<TApiResponse<ITokenInfo>> {
    return (await client.post<TApiResponse<ITokenInfo>>('/auth/email/login', data)).data
  }

  static async refreshToken(): Promise<TApiResponse<ITokenInfo>> {
    return (await client.post<TApiResponse<ITokenInfo>>('/auth/refresh', {})).data
  }

  static async signOut(): Promise<void> { await client.post('/auth/logout', {}) }
  static async getUserInfoList(): Promise<TApiResponse<UserInfo[]>> {
    return (await client.get<TApiResponse<UserInfo[]>>('/UserAccount/GetUsers', {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    })).data
  }
}
