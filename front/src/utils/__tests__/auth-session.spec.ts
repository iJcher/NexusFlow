import type { ITokenInfo } from '@/types/auth.types'
import { beforeEach, describe, expect, it } from 'vitest'
import { getAccessToken, getAuthSession, setAuthSession } from '../auth-session'

describe('p00 memory-only access session', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setAuthSession(null)
  })
  it('holds access credentials only in memory and clears them completely', () => {
    const session: ITokenInfo = {
      type: 'Bearer',
      accessToken: 'unit-only-secret',
      expiresIn: 60,
      user: { id: 'u1', email: 'unit@example.com', nickName: 'Unit', role: 0 },
    }
    expect(getAuthSession()).toBeNull()
    setAuthSession(session)
    expect(getAccessToken()).toBe(session.accessToken)
    expect(getAuthSession()).toEqual(session)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    setAuthSession(null)
    expect(getAuthSession()).toBeNull()
    expect(getAccessToken()).toBeNull()
  })
})
