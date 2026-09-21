// Token storage. Access + refresh tokens persist in localStorage;
// impersonation tokens live in memory only (never persisted — see the guide §3).
const ACCESS_KEY = 'ikh.access'
const REFRESH_KEY = 'ikh.refresh'

export function getAccess() { return localStorage.getItem(ACCESS_KEY) || null }
export function getRefresh() { return localStorage.getItem(REFRESH_KEY) || null }
export function setTokens(access, refresh) {
  if (access) localStorage.setItem(ACCESS_KEY, access)
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
}
export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}
