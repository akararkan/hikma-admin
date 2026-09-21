import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { fmtDate, short } from '../util'

/* ---------- banners ---------- */
export function Err({ e }) {
  if (!e) return null
  return (
    <div className="banner error">
      {e.errorCode ? <strong>{e.errorCode}: </strong> : null}
      {e.message || String(e)}
      {e.details ? <div className="mono">{JSON.stringify(e.details)}</div> : null}
      {Array.isArray(e.fieldErrors) && e.fieldErrors.length > 0 && (
        <ul>
          {e.fieldErrors.map((f, i) => <li key={i}>{f.field}: {f.message}</li>)}
        </ul>
      )}
    </div>
  )
}
export function Ok({ msg }) { return msg ? <div className="banner ok">{typeof msg === 'string' ? msg : 'Done.'}</div> : null }
export function Note({ children }) { return children ? <div className="banner note">ℹ {children}</div> : null }
export function Warn({ children }) { return children ? <div className="banner warn">⚠ {children}</div> : null }
export function Loading({ on }) { return on ? <div className="loading"><span className="spinner" />Loading…</div> : null }

/* ---------- page teaching blocks (easy-English) ---------- */
/** Top-of-page explainer. Title = the page's plain name; lead = one short
    sentence saying what the page is for; bullets = "You can …" actions. */
export function PageIntro({ title, lead, bullets, children }) {
  return (
    <div className="page-intro">
      {title ? <h1>{title}</h1> : null}
      {lead ? <p className="page-intro-lead">{lead}</p> : null}
      {Array.isArray(bullets) && bullets.length > 0 && (
        <ul className="page-intro-list">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
      {children}
    </div>
  )
}

/** Collapsible numbered mini-guide: <HowTo steps={['Type a name…', 'Click…']} /> */
export function HowTo({ title = 'How do I use this page?', steps, children }) {
  return (
    <details className="howto">
      <summary>❓ {title}</summary>
      {Array.isArray(steps) && steps.length > 0 && (
        <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      )}
      {children}
    </details>
  )
}

/* ---------- stat tiles ---------- */
export function Tiles({ items }) {
  return (
    <div className="tiles">
      {items.filter(Boolean).map((t, i) => (
        <div className="tile" key={i}>
          <div className="tile-value">{t.value ?? '—'}</div>
          <div className="tile-label">{t.label}</div>
          {t.sub ? <div className="tile-sub">{t.sub}</div> : null}
        </div>
      ))}
    </div>
  )
}

/* ---------- table ---------- */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function cell(v) {
  if (v === null || v === undefined) return <span className="muted">—</span>
  // Neutral ink, not success green: "true" is not always good news — a green check
  // on "Account locked" would read as "all fine".
  if (typeof v === 'boolean') return v ? <span>✓</span> : <span className="muted">✕</span>
  if (typeof v === 'object') return <code>{JSON.stringify(v)}</code>
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return fmtDate(s)
  if (UUID_RE.test(s)) return <code>{s}</code>
  return s
}

/** Shortened id that copies its full value on click — a tooltip alone cannot be
    copied, and several pages tell the admin to paste the id somewhere else. */
export function Id({ v }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(t)
  }, [copied])
  if (v === null || v === undefined || v === '') return <span className="muted">—</span>
  const s = String(v)
  return (
    <button
      type="button"
      className="id-chip"
      title={`${s} — click to copy the full id`}
      onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(s); setCopied(true) }}
    >{copied ? 'copied ✓' : short(s)}</button>
  )
}

/**
 * `loading` keeps the empty state honest: while the first fetch is in flight the
 * box says Loading — it never claims "no results" about data it hasn't seen.
 * `tall` caps the height and makes the header sticky — for the long queues.
 */
export function DataTable({ columns, rows, onRow, empty = 'Nothing here yet.', rowKey, loading, tall }) {
  if (!rows || rows.length === 0) {
    if (loading) return <div className="empty loading"><span className="spinner" />Loading…</div>
    return <div className="empty">{empty}</div>
  }
  return (
    <div className={`table-wrap${tall ? ' tall' : ''}`}>
      <table className="table">
        <thead><tr>{columns.map((c) => <th key={c.key || c.label}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={(rowKey && rowKey(r)) || r.id || i}
              className={onRow ? 'clickable' : ''}
              onClick={onRow ? () => onRow(r) : undefined}
              // Clickable rows are real actions — keyboard users get them too. The
              // target guard matters: Enter/Space bubbling up from a button or
              // checkbox INSIDE a cell must activate that control, never the row.
              tabIndex={onRow ? 0 : undefined}
              onKeyDown={onRow ? (e) => {
                if (e.target !== e.currentTarget) return
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRow(r) }
              } : undefined}
            >
              {columns.map((c) => <td key={c.key || c.label}>{c.render ? c.render(r, i) : cell(r[c.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- pagination ---------- */
export function Pager({ data, page, onPage, prevLabel = '← Back', nextLabel = 'Next →' }) {
  const totalPages = data?.totalPages ?? 0
  const totalElements = data?.totalElements
  if (!data || totalPages <= 1) {
    return totalElements != null ? <div className="pager muted">{totalElements} total</div> : null
  }
  return (
    <div className="row pager">
      <button className="small secondary" disabled={page <= 0} onClick={() => onPage(page - 1)}>{prevLabel}</button>
      <span>Page {page + 1} of {totalPages} ({totalElements} in total)</span>
      <button className="small secondary" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)}>{nextLabel}</button>
    </div>
  )
}
/** Keyset "load more": caller passes last row's createdAt as cursor.
    Callers that ACCUMULATE rows across loads must pass lastBatch (the size of the most
    recent fetch) — testing the accumulated length against pageSize is wrong in both
    directions (dead-forever button past one page; premature end on a short first page). */
export function CursorPager({ rows, pageSize = 20, onMore, cursorField = 'createdAt', lastBatch, label = 'Show more' }) {
  if (!rows || rows.length === 0) return null
  if (lastBatch != null ? lastBatch === 0 : rows.length < pageSize) return null
  const last = rows[rows.length - 1]
  return (
    <button className="small secondary mt-2" title={`cursor: ${String(last?.[cursorField] ?? '').slice(0, 19)}`} onClick={() => onMore(last?.[cursorField])}>
      {label}
    </button>
  )
}

/* ---------- tabs ---------- */
export function Tabs({ tabs, active, onChange }) {
  const refs = React.useRef([])
  const ids = tabs.map((t) => (typeof t === 'string' ? t : t.id))
  // Roving tabindex: the tab list is one stop; arrows move between tabs.
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i = Math.max(0, ids.indexOf(active))
    const next = e.key === 'ArrowRight' ? (i + 1) % ids.length : (i - 1 + ids.length) % ids.length
    onChange(ids[next])
    refs.current[next]?.focus()
  }
  return (
    <div className="tabs" role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((t, i) => {
        const id = typeof t === 'string' ? t : t.id
        const label = typeof t === 'string' ? t : t.label
        return (
          <button
            key={id}
            ref={(el) => { refs.current[i] = el }}
            role="tab"
            aria-selected={active === id}
            tabIndex={active === id ? 0 : -1}
            className={active === id ? 'active' : ''}
            onClick={() => onChange(id)}
          >{label}</button>
        )
      })}
    </div>
  )
}

/* ---------- modal + confirms ---------- */

/** Nested modals (a step-up prompt over a form) must not unlock the page when the inner one closes. */
let openModals = 0

/**
 * Freeze the page behind an open modal, so a scroll gesture moves the modal and never the page.
 * Returns this modal's depth in the stack — 1 is the bottom one, `openModals` is the topmost.
 * `enabled` exists for the step-up modal, which stays mounted and only sometimes shows.
 */
export function useScrollLock(enabled = true) {
  const depth = React.useRef(0)
  useEffect(() => {
    if (!enabled) return undefined
    const { body } = document
    if (openModals === 0) {
      // Compensating for the scrollbar keeps the page from jumping sideways as it locks.
      const gap = window.innerWidth - document.documentElement.clientWidth
      body.dataset.prevPaddingRight = body.style.paddingRight
      body.style.overflow = 'hidden'
      if (gap > 0) body.style.paddingRight = `${gap}px`
    }
    openModals += 1
    depth.current = openModals
    return () => {
      openModals -= 1
      depth.current = 0
      if (openModals === 0) {
        body.style.overflow = ''
        body.style.paddingRight = body.dataset.prevPaddingRight || ''
        delete body.dataset.prevPaddingRight
      }
    }
  }, [enabled])
  return depth
}

/** True while this modal is the topmost one on screen. */
const isTopmost = (depth) => depth.current === openModals

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
/* Disabled or hidden controls are skipped by the browser's tab order, so the
   trap must skip them too — a disabled submit button as `last` would let focus
   walk straight out of the dialog. */
const focusablesIn = (el) => [...el.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled && n.offsetParent !== null)

/** Children of a Modal use this to close it WITH the exit animation —
    calling the raw onClose prop unmounts in a hard cut. */
const ModalCloseCtx = React.createContext(null)
export const useModalClose = () => React.useContext(ModalCloseCtx)

/**
 * Rendered through a portal on <body>, not in place: the sticky top bar and sidebar sit in the
 * page's stacking order, and an overlay rendered inside the scrolling content column paints
 * *under* them — the modal's title and first fields end up hidden behind the top bar. On <body>
 * the overlay's z-index is measured against the shell, so it always covers it.
 *
 * Closing plays the exit animation first: `requestClose` flips `.closing` and the real
 * onClose fires on the overlay's animationend (reduced motion runs it at 0.01ms, so
 * close stays effectively instant for those users).
 */
export function Modal({ title, onClose, children, wide }) {
  const depth = useScrollLock()
  const [closing, setClosing] = useState(false)
  const ref = React.useRef(null)
  const titleId = React.useId()
  const requestClose = React.useCallback(() => { if (onClose) setClosing(true) }, [onClose])

  // Focus moves into the dialog on open — preferring an [autofocus] child, which
  // React applies before this effect runs — and back to the opener on unmount.
  useEffect(() => {
    const prev = document.activeElement
    if (!ref.current?.contains(document.activeElement)) {
      (ref.current?.querySelector('[autofocus]') || ref.current)?.focus()
    }
    return () => { if (prev && typeof prev.focus === 'function') prev.focus() }
  }, [])

  // Escape closes the topmost modal only — every open modal listens on `document`, so without the
  // depth test one key press would tear down the whole stack at once. Tab is trapped inside.
  useEffect(() => {
    const onKey = (e) => {
      if (!isTopmost(depth)) return
      if (e.key === 'Escape') { requestClose(); return }
      if (e.key !== 'Tab' || !ref.current) return
      const focusables = focusablesIn(ref.current)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose])

  return createPortal(
    <div
      className={`modal-overlay${closing ? ' closing' : ''}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose() }}
      // Only the overlay's own exit animation ending unmounts — bubbled child
      // animation ends (modalOut, banners) must not fire onClose early.
      onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) onClose?.() }}
    >
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="link" aria-label="Close" onClick={requestClose}>✕</button>
        </div>
        <div className="modal-body">
          <ModalCloseCtx.Provider value={requestClose}>{children}</ModalCloseCtx.Provider>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* Rendered inside Modal's children, so it can reach useModalClose and Cancel
   plays the same exit animation as Escape and the ✕ button. */
function ConfirmBody({ message, requireText, confirmLabel, danger, onConfirm, onClose, busy }) {
  const [typed, setTyped] = useState('')
  const close = useModalClose() || onClose
  const blocked = requireText && typed !== requireText
  return (
    <>
      <div>{message}</div>
      {requireText && (
        <div className="field mt-2">
          <span>To continue, type <code>{requireText}</code> in this box</span>
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requireText} />
        </div>
      )}
      <div className="modal-actions">
        <button className="secondary" onClick={close}>Cancel</button>
        <button className={danger ? 'danger' : ''} disabled={blocked || busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </>
  )
}

/** Danger-zone confirm with optional typed confirmation (guide §6). */
export function Confirm({ title = 'Confirm', message, requireText, confirmLabel = 'Confirm', danger = true, onConfirm, onClose, busy }) {
  return (
    <Modal title={title} onClose={onClose}>
      <ConfirmBody message={message} requireText={requireText} confirmLabel={confirmLabel} danger={danger} onConfirm={onConfirm} onClose={onClose} busy={busy} />
    </Modal>
  )
}

/* ---------- forms ---------- */
export function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>
}
export function Select({ value, onChange, options, allowEmpty = true, emptyLabel = '(any)' }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        const l = typeof o === 'string' ? o : o.label
        return <option key={v} value={v}>{l}</option>
      })}
    </select>
  )
}

/* ---------- misc ---------- */
export function JsonBlock({ v }) {
  if (v === null || v === undefined) return <span className="muted">—</span>
  return <pre className="json">{typeof v === 'string' ? v : JSON.stringify(v, null, 2)}</pre>
}
export function KV({ obj, keys }) {
  if (!obj) return null
  const entries = keys ? keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]) : Object.entries(obj)
  return (
    <dl className="kv">
      {entries.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt>
          <dd>{cell(v)}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}
export function Badge({ kind, children }) { return <span className={`badge ${kind || ''}`}>{children}</span> }
export function StatusBadge({ value }) {
  if (value == null) return null
  const v = String(value).toUpperCase()
  let kind = ''
  if (['ACTIVE', 'UP', 'SUCCESS', 'APPROVED', 'PUBLISHED', 'READY', 'SENT', 'LIVE'].includes(v)) kind = 'green'
  else if (['DOWN', 'FAILED', 'REJECTED', 'REMOVED', 'ERROR', 'DELETED', 'LOCKED', 'BANNED', 'DISCARDED'].some((x) => v.includes(x))) kind = 'err'
  // OPEN is a waiting state (an open report, a hold waiting for a second admin) — blue, not green.
  else if (['PENDING', 'PENDING_REVIEW', 'PROCESSING', 'SUBMITTED', 'TRIAGED', 'SCHEDULED', 'PARKED', 'RUNNING', 'PENDING_APPROVAL', 'PENDING_DELETION', 'APPEALED', 'OPEN'].includes(v)) kind = 'blue'
  else kind = 'gray'
  return <Badge kind={kind}>{v}</Badge>
}

/** Compact horizontal series: {'2026-08-05': 12, ...} rendered as label+bar rows.
    Long text labels (funnel steps) truncate with ellipsis instead of colliding with the track. */
export function SeriesBars({ series, max: maxIn, limit = 31 }) {
  if (!series) return <span className="muted">—</span>
  const entries = Object.entries(series).sort(([a], [b]) => a.localeCompare(b)).slice(-limit)
  if (entries.length === 0) return <span className="muted">no data</span>
  const max = maxIn || Math.max(1, ...entries.map(([, v]) => Number(v) || 0))
  return (
    <div className="series">
      {entries.map(([k, v]) => (
        <div className="series-row" key={k}>
          <span className="mono series-key" title={k}>{k}</span>
          <div className="series-track"><div className="series-fill" style={{ width: `${(Number(v) / max) * 100}%` }} /></div>
          <span className="mono right series-val">{v}</span>
        </div>
      ))}
    </div>
  )
}
