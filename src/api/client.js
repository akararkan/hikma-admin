import { getAccess, getRefresh, setTokens, clearTokens } from '../auth/tokens'

// '' = same-origin (vite dev proxy / reverse proxy). Set VITE_API_BASE to call the backend directly.
export const BASE = import.meta.env.VITE_API_BASE || ''

/* ---- hooks the App registers ---- */
let stepUpHandler = null   // () => Promise<boolean> — opens the step-up modal, resolves true when armed
let logoutHandler = null   // () => void — hard logout to /login
export function setStepUpHandler(fn) { stepUpHandler = fn }
export function setLogoutHandler(fn) { logoutHandler = fn }

export class ApiError extends Error {
  constructor(status, body, fallbackMsg) {
    super((body && (body.message || body.error)) || fallbackMsg || `HTTP ${status}`)
    this.status = status
    this.errorCode = body?.errorCode || body?.code || null
    this.details = body?.details || null
    this.fieldErrors = body?.fieldErrors || null
    this.traceId = body?.traceId || null
    this.body = body
  }
}

async function parseError(res) {
  let body = null
  try {
    const text = await res.text()
    if (text) { try { body = JSON.parse(text) } catch { body = { message: text.slice(0, 300) } } }
  } catch { /* ignore */ }
  return new ApiError(res.status, body, res.statusText)
}

/* single-flight refresh */
let refreshing = null
async function doRefresh() {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const rt = getRefresh()
    if (!rt) return false
    try {
      const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      })
      if (!res.ok) return false
      const d = await res.json().catch(() => null)
      const access = d?.accessToken || d?.access_token || d?.token || d?.jwt
      const refresh = d?.refreshToken || d?.refresh_token
      if (!access) return false
      setTokens(access, refresh || rt)
      return true
    } catch { return false }
  })()
  try { return await refreshing } finally { refreshing = null }
}

function buildUrl(path, params) {
  let url = BASE + path
  if (params) {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, x))
      else sp.append(k, v)
    }
    const qs = sp.toString()
    if (qs) url += (url.includes('?') ? '&' : '?') + qs
  }
  return url
}

/**
 * Core request helper.
 * opts: { method, body, params, headers, blob, auth=true, allowStepUp=true, _authRetried, _stepUpRetried }
 * - 401 → refresh once → retry; failing that → logout.
 * - 403 STEP_UP_REQUIRED → open step-up modal → retry with the SAME Idempotency-Key.
 * - blob:true → { blob, headers } for CSV downloads.
 */
export async function api(path, opts = {}) {
  const {
    method = 'GET', body, params, headers = {}, blob = false,
    auth = true, allowStepUp = true, _authRetried = false, _stepUpRetried = false,
  } = opts

  const h = { ...headers }
  if (auth) {
    const tok = typeof opts.token === 'string' ? opts.token : getAccess()
    if (tok) h['Authorization'] = `Bearer ${tok}`
  }
  // FormData passes through untouched — the browser sets the multipart boundary itself.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !isForm && !h['Content-Type']) h['Content-Type'] = 'application/json'
  const mutating = !['GET', 'HEAD'].includes(method)
  if (mutating && !h['Idempotency-Key']) h['Idempotency-Key'] = crypto.randomUUID()

  const res = await fetch(buildUrl(path, params), {
    method,
    headers: h,
    body: body !== undefined ? (isForm ? body : JSON.stringify(body)) : undefined,
  })

  if (res.status === 401 && auth && !_authRetried) {
    const ok = await doRefresh()
    if (ok) return api(path, { ...opts, headers: h, _authRetried: true })
    clearTokens()
    logoutHandler?.()
    throw await parseError(res)
  }

  if (res.status === 403 && allowStepUp && !_stepUpRetried && stepUpHandler) {
    const err = await parseError(res)
    if (err.errorCode === 'STEP_UP_REQUIRED') {
      const armed = await stepUpHandler()
      if (armed) return api(path, { ...opts, headers: h, _stepUpRetried: true })
      throw err
    }
    throw err
  }

  if (!res.ok) throw await parseError(res)

  if (blob) return { blob: await res.blob(), headers: res.headers, status: res.status }
  if (res.status === 204) return null
  const text = await res.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}

export const get = (path, params, opts) => api(path, { ...opts, params })
export const post = (path, body, opts) => api(path, { ...opts, method: 'POST', body })
export const put = (path, body, opts) => api(path, { ...opts, method: 'PUT', body })
export const patch = (path, body, opts) => api(path, { ...opts, method: 'PATCH', body })
export const del = (path, body, opts) => api(path, { ...opts, method: 'DELETE', body })
