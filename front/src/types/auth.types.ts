export interface ISignInRequest { email: string, challengeId: string, code: string }
export interface EmailChallenge { challengeId: string, expiresAt: string, retryAfter: number }
export interface ITokenInfo {
  type: 'Bearer'
  accessToken: string
  expiresIn: number
  user: { id: string, email: string | null, nickName: string, role: number }
}
export interface LoginUserInfo { id: string, name: string, role: number }
export enum UserRole { Admin = 'Admin', User = 'User' }
export interface UserInfo { id: string, email: string | null, phoneNumber: string, nickName?: string }
