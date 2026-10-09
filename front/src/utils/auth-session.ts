import type { ITokenInfo } from '@/types/auth.types'

// Access tokens stay in memory; the backend-owned HttpOnly cookie persists.
let session: ITokenInfo | null = null
export function getAuthSession(): ITokenInfo | null {
  return session
}
export function setAuthSession(value: ITokenInfo | null): void {
  session = value
}
export function getAccessToken(): string | null {
  return session?.accessToken ?? null
}
