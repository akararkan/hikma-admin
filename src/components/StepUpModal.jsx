import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AuthApi } from '../api'
import { setStepUpHandler } from '../api/client'
import { Err, Tabs, useScrollLock } from './ui'

/**
 * Global step-up modal. The API client calls the registered handler when any request
 * fails with 403 STEP_UP_REQUIRED; on 204 from POST /api/v1/security/step-up the
 * original request is retried with the same Idempotency-Key (guide §2).
 */
export default function StepUpModal() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('password') // password | code
  const [value, setValue] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [armedUntil, setArmedUntil] = useState(0)
  const resolver = useRef(null)
  // This component is always mounted, so the lock has to follow `open`, not the mount.
  useScrollLock(open)

  useEffect(() => {
    setStepUpHandler(() => new Promise((resolve) => {
      // proactively skip the modal while the client-side window looks armed (server stays authoritative)
      if (Date.now() < armedUntil) { resolve(true); return }
      resolver.current = resolve
      setValue(''); setErr(null); setOpen(true)
    }))
    return () => setStepUpHandler(null)
  }, [armedUntil])

  const finish = useCallback((ok) => {
    setOpen(false)
    resolver.current?.(ok)
    resolver.current = null
  }, [])

  const submit = async (e) => {
    e?.preventDefault()
    if (!value) return
    setBusy(true); setErr(null)
    try {
      await AuthApi.stepUp(mode === 'password' ? { password: value } : { code: value })
      setArmedUntil(Date.now() + 290_000) // ~300s server TTL, small margin
      finish(true)
    } catch (ex) { setErr(ex) } finally { setBusy(false) }
  }

  if (!open) return null
  return createPortal(
    // Deliberately NOT the shared Modal component: an auth challenge must not be
    // dismissable by clicking outside — that would silently fail the pending request.
    // `stepup` puts it above the form modal that triggered it; the portal keeps it above the shell.
    <div className="modal-overlay stepup">
      <div className="modal" role="dialog" aria-modal="true">
        <h2>Extra safety check</h2>
        <p className="modal-lead">
          This is a big action, so please prove it is really you.
          Type your password (or your 6-number code) one more time.
          After that, you can do big actions for about 5 minutes without asking again.
        </p>
        <Tabs
          tabs={[{ id: 'password', label: 'Use my password' }, { id: 'code', label: 'Use my 6-number code' }]}
          active={mode}
          onChange={setMode}
        />
        <form onSubmit={submit}>
          <div className="field">
            <span>{mode === 'password' ? 'Your password' : 'The 6-number code from your phone app'}</span>
            <input
              type={mode === 'password' ? 'password' : 'text'}
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === 'password' ? '••••••••' : '123456'}
            />
          </div>
          <Err e={err} />
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => finish(false)}>Stop — do not do it</button>
            <button type="submit" disabled={busy || !value}>{busy ? 'Checking…' : 'Yes, it is me — continue'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
