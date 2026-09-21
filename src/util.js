import { useState, useEffect, useCallback, useRef } from 'react'

export function fmtDate(v) {
  if (!v) return ''
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return String(v)
    return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z'
  } catch { return String(v) }
}

export function fmtBytes(n) {
  if (n == null) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = Number(n); let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function fmtNum(n) {
  if (n == null) return ''
  return Number(n).toLocaleString('en-US')
}

export function short(id) {
  if (!id) return ''
  const s = String(id)
  return s.length > 12 ? s.slice(0, 8) + '…' : s
}

export function decodeJwt(token) {
  try {
    const p = token.split('.')[1]
    return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return {} }
}

export function roleFromClaims(claims) {
  if (!claims) return null
  const norm = (r) => (typeof r === 'string' ? r.replace(/^ROLE_/, '') : null)
  if (claims.role) return norm(claims.role)
  if (Array.isArray(claims.roles) && claims.roles.length) return norm(claims.roles[0])
  if (Array.isArray(claims.authorities) && claims.authorities.length) {
    const a = claims.authorities.map(norm).filter(Boolean)
    for (const r of ['ADMIN', 'MODERATOR', 'SUPPORT', 'ANALYST']) if (a.includes(r)) return r
    return a[0]
  }
  if (typeof claims.auth === 'string') return norm(claims.auth.split(',')[0])
  return null
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename || 'download'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function filenameFromDisposition(headers, fallback) {
  const cd = headers?.get?.('Content-Disposition') || ''
  const m = /filename="?([^";]+)"?/.exec(cd)
  return m ? m[1] : fallback
}

/** Debounce a fast-changing value (filter text) so effects fire once typing pauses,
    not once per keystroke. Pass the debounced value into useLoad's deps. */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Load data on mount / when deps change. */
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  // Monotonic sequence: fast typing fires overlapping fetches, and an older response
  // resolving last must not overwrite the newest one's rows.
  const seq = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    const id = ++seq.current
    setLoading(true); setErr(null)
    try {
      const d = await fn()
      if (id === seq.current) setData(d)
    } catch (e) {
      if (id === seq.current) setErr(e)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, deps)
  useEffect(() => { reload() }, [reload])
  return { data, err, loading, reload, setData }
}

/** Run mutations with busy/error/success state. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true); setErr(null); setOk(null)
    try {
      const r = await fn()
      setOk(okMsg || 'Done.')
      return r
    } catch (e) {
      setErr(e)
      return undefined
    } finally { setBusy(false) }
  }, [])
  const clear = useCallback(() => { setErr(null); setOk(null) }, [])
  return { run, busy, err, ok, clear, setOk, setErr }
}

/** Turn a Spring Page or bare array into {rows, page info}. */
export function pageRows(d) {
  if (!d) return []
  if (Array.isArray(d)) return d
  if (Array.isArray(d.content)) return d.content
  return []
}
