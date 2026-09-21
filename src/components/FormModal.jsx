import React, { useState } from 'react'
import { Modal, Err, useModalClose } from './ui'

const optValue = (o) => (typeof o === 'string' ? o : o?.value)
const optLabel = (o) => (typeof o === 'string' ? o : (o?.label ?? o?.value))

/**
 * Initial value for one field. A required select renders no `(none)` option, so an empty
 * initial value matches nothing and the browser silently displays the first option while
 * state stays '' — which reads as "missing" and disables submit until the user re-picks.
 * Seed it with the first option so state matches what is on screen.
 */
function initialValue(f) {
  if (f.type === 'checkbox') return f.value ?? false
  if (f.type === 'select') {
    const v = f.value ?? ''
    return v === '' && f.required ? (optValue((f.options || [])[0]) ?? '') : v
  }
  return f.value ?? ''
}

/** Only ''/null/undefined count as missing — a required number field may legitimately be 0. */
const isMissing = (f, v) => (f.type === 'checkbox' ? !v : v === '' || v === null || v === undefined)

/* The body renders inside Modal's children, so useModalClose is reachable and
   Cancel / successful submit play the same exit animation as Escape and ✕. */
function FormBody({ fields, onSubmit, onClose, submitLabel, danger, requireText, intro }) {
  const [values, setValues] = useState(() => {
    const v = {}
    for (const f of fields) v[f.name] = initialValue(f)
    return v
  })
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const close = useModalClose() || onClose

  const set = (name, v) => setValues((s) => ({ ...s, [name]: v }))
  const missing = fields.some((f) => f.required && isMissing(f, values[f.name]))
  const blocked = (requireText && typed !== requireText) || missing

  const submit = async (e) => {
    e?.preventDefault()
    setBusy(true); setErr(null)
    try {
      const out = {}
      for (const f of fields) {
        let v = values[f.name]
        if (f.type === 'number') v = v === '' ? undefined : Number(v)
        if (v === '' && !f.keepEmpty) v = undefined
        out[f.name] = v
      }
      await onSubmit(out)
      close?.()
    } catch (ex) { setErr(ex) } finally { setBusy(false) }
  }

  return (
    <>
      {intro && <p className="modal-lead">{intro}</p>}
      <form onSubmit={submit} className="form-col">
        {fields.map((f) => (
          <label className="field" key={f.name}>
            {/* Many callers already put the `*` in the label — don't render a second one. */}
            <span>{f.label}{f.required && !String(f.label ?? '').includes('*') ? ' *' : ''}</span>
            {f.type === 'textarea' ? (
              <textarea value={values[f.name]} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
            ) : f.type === 'select' ? (
              <select value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)}>
                {!f.required && <option value="">(none)</option>}
                {/* A value the server sent that is not in `options` still has to be shown, or the
                    browser displays option 0 while state submits something else. */}
                {values[f.name] !== '' && values[f.name] != null && !(f.options || []).some((o) => optValue(o) === values[f.name]) && (
                  <option value={values[f.name]}>{String(values[f.name])}</option>
                )}
                {(f.options || []).map((o) => (
                  <option key={optValue(o)} value={optValue(o)}>{optLabel(o)}</option>
                ))}
              </select>
            ) : f.type === 'checkbox' ? (
              <input type="checkbox" checked={!!values[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
            ) : (
              <input type={f.type || 'text'} value={values[f.name]} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
            )}
            {f.help && <span className="help">{f.help}</span>}
          </label>
        ))}
        {requireText && (
          <label className="field">
            {/* Only claim irreversibility for actual danger flows — reversible actions
                also use typed confirmation (e.g. a plain rebuild) and must not lie. */}
            <span>{danger ? 'This cannot be undone. To continue, type ' : 'To continue, type '}<code>{requireText}</code> in this box</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requireText} />
          </label>
        )}
        <Err e={err} />
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>Cancel</button>
          <button type="submit" className={danger ? 'danger' : ''} disabled={busy || blocked}>{busy ? 'Working…' : submitLabel}</button>
        </div>
      </form>
    </>
  )
}

/**
 * Generic mutation modal.
 * fields: [{name, label, type='text'|'textarea'|'number'|'checkbox'|'select', options, value, placeholder, required, help}]
 * onSubmit(values) may throw an ApiError → rendered inline. requireText adds typed confirmation.
 */
export default function FormModal({ title, fields = [], onSubmit, onClose, submitLabel = 'Submit', danger = false, requireText, intro, wide }) {
  return (
    <Modal title={title} onClose={onClose} wide={wide}>
      <FormBody fields={fields} onSubmit={onSubmit} onClose={onClose} submitLabel={submitLabel} danger={danger} requireText={requireText} intro={intro} />
    </Modal>
  )
}
