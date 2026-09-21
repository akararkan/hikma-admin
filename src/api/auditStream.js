// Singleton SSE subscription to GET /api/v1/admin/audit/stream?token=…
// The shell subscribes once; widgets filter the event flow client-side (guide §5.5).
import { BASE } from './client'
import { getAccess } from '../auth/tokens'

let es = null
let timer = null
const listeners = new Set()
let buffer = []            // newest first, capped
let status = 'idle'        // idle | connecting | open | error
let lastEventAt = null

function notify() { listeners.forEach((l) => { try { l({ rows: buffer, status, lastEventAt }) } catch { /* noop */ } }) }

function connect() {
  const token = getAccess()
  if (!token || es) return
  status = 'connecting'; notify()
  es = new EventSource(`${BASE}/api/v1/admin/audit/stream?token=${encodeURIComponent(token)}`)
  es.addEventListener('connected', () => { status = 'open'; notify() })
  es.addEventListener('audit', (e) => {
    try {
      const row = JSON.parse(e.data)
      buffer = [row, ...buffer].slice(0, 300)
      lastEventAt = Date.now()
      notify()
    } catch { /* ignore malformed */ }
  })
  es.addEventListener('heartbeat', () => { lastEventAt = Date.now(); status = 'open'; notify() })
  es.onerror = () => {
    status = 'error'; notify()
    try { es.close() } catch { /* noop */ }
    es = null
    clearTimeout(timer)
    timer = setTimeout(connect, 6000) // reconnect with backoff
  }
}

export function subscribeAudit(fn) {
  listeners.add(fn)
  connect()
  fn({ rows: buffer, status, lastEventAt })
  return () => listeners.delete(fn)
}

export function stopAuditStream() {
  clearTimeout(timer); timer = null
  try { es?.close() } catch { /* noop */ }
  es = null
  buffer = []
  status = 'idle'
  notify()
}
