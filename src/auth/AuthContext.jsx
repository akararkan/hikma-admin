import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { AuthApi, UsersApi } from '../api'
import { getAccess, setTokens, clearTokens } from './tokens'
import { setLogoutHandler } from '../api/client'
import { stopAuditStream } from '../api/auditStream'
import { decodeJwt, roleFromClaims } from '../util'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

const STAFF_ROLES = ['ADMIN', 'MODERATOR', 'SUPPORT', 'ANALYST']

function userFromToken(token, extra = {}) {
  if (!token) return null
  const claims = decodeJwt(token)
  const role = extra.role || roleFromClaims(claims) || 'ADMIN' // unknown claim shape → show all nav; server enforces
  return {
    id: claims.uid || claims.userId || claims.sub || null,
    username: extra.username || claims.username || claims.preferred_username || claims.email || claims.sub || 'admin',
    role,
    isStaff: STAFF_ROLES.includes(role),
    claims,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => userFromToken(getAccess()))
  const [impersonation, setImpersonation] = useState(null) // {token, targetUserId, targetUsername, expiresAt} — memory only

  const hardLogout = useCallback(() => {
    clearTokens()
    stopAuditStream()
    setImpersonation(null)
    setUser(null)
  }, [])

  useEffect(() => { setLogoutHandler(hardLogout) }, [hardLogout])

  // Turn a token-bearing auth response into a signed-in session.
  const adopt = useCallback((d) => {
    const access = d?.accessToken || d?.access_token || d?.token || d?.jwt
    const refresh = d?.refreshToken || d?.refresh_token
    if (!access) throw new Error('Login response carried no access token.')
    setTokens(access, refresh)
    const extra = {}
    if (d?.user) { extra.username = d.user.username; extra.role = d.user.role }
    else if (d?.role) extra.role = d.role
    const u = userFromToken(access, extra)
    setUser(u)
    return u
  }, [])

  /**
   * Leg 1 of login. On a 2FA-protected account the password is accepted but **no
   * session is issued** — the server answers `{mfaRequired:true, mfaToken, expiresIn}`
   * and the caller must finish with `completeTwoFactor`. `mfaRequired` is omitted
   * entirely (never `false`) on ordinary logins, so its presence is the branch.
   */
  const login = useCallback(async (username, password) => {
    const d = await AuthApi.login(username, password)
    if (d?.mfaRequired) {
      // The challenge IS a credential: hand it back so the caller keeps it in
      // component state. It is deliberately never written to storage.
      return { mfaRequired: true, mfaToken: d.mfaToken, expiresIn: d.expiresIn || 300 }
    }
    return adopt(d)
  }, [adopt])

  /** Leg 2 — redeem the challenge with a 6-digit code or a single-use recovery code. */
  const completeTwoFactor = useCallback(
    async (mfaToken, code) => adopt(await AuthApi.loginTwoFactor(mfaToken, code)),
    [adopt],
  )

  const logout = useCallback(async () => {
    try { await AuthApi.logout() } catch { /* best-effort */ }
    hardLogout()
  }, [hardLogout])

  const logoutAll = useCallback(async () => {
    try { await AuthApi.logoutAll() } catch { /* best-effort */ }
    hardLogout()
  }, [hardLogout])

  const startImpersonation = useCallback((grant) => {
    // grant: {token, targetUserId, targetUsername, expiresAt}
    setImpersonation(grant)
  }, [])

  const endImpersonation = useCallback(async () => {
    try { await UsersApi.endImpersonation() } catch { /* expiry alone also kills it */ }
    setImpersonation(null)
  }, [])

  const value = useMemo(() => ({
    user, login, completeTwoFactor, logout, logoutAll,
    impersonation, startImpersonation, endImpersonation,
  }), [user, login, completeTwoFactor, logout, logoutAll,
    impersonation, startImpersonation, endImpersonation])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
