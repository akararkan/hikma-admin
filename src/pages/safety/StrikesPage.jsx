import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { SafetyApi } from '../../api'
import { useLoad, useAction, pageRows, useDebounced } from '../../util'
import { PageIntro, HowTo, DataTable, Pager, Err, Ok, Note, Field, Select, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'

/** Days until the strike stops counting; null when it already ended. */
function daysLeft(r) {
  if (!r?.expiresAt) return null
  const ms = new Date(r.expiresAt).getTime() - Date.now()
  if (isNaN(ms) || ms <= 0) return null
  return Math.ceil(ms / 86400000)
}

export default function StrikesPage() {
  const [userId, setUserId] = useState('')
  const [active, setActive] = useState(undefined)
  const [page, setPage] = useState(0)
  // Debounced: the user-id box feeds the fetch, so wait for typing to pause.
  const dUserId = useDebounced(userId, 300)
  const { data, err, loading, reload } = useLoad(
    () => SafetyApi.strikes({ userId: dUserId || undefined, active, page, size: 25 }),
    [dUserId, active, page]
  )
  const act = useAction()
  const [issueOpen, setIssueOpen] = useState(false)
  const [revoke, setRevoke] = useState(null)

  return (
    <div>
      <PageIntro
        title="Warnings (strikes)"
        lead="A warning (strike) is a note on a user's account that says they broke a rule. It stops counting by itself after 90 days."
        bullets={[
          'You can see every warning ever given, newest first.',
          'You can filter by one user, or show only warnings that still count.',
          'You can give a user a new warning.',
          'You can cancel a warning that was given by mistake.',
        ]}
      />
      <HowTo steps={[
        'To check one user, paste their user id in the box and the list reloads.',
        'The "Still counts?" column shows if a warning is still active. Old warnings stay in the list but do not count.',
        'To give a warning, press "Give a warning". The user gets an "Account warning" message.',
        'To cancel a warning, press "Cancel" on its row. This cannot be turned back on — you would give a new warning instead.',
      ]} />
      <div className="filters">
        <Field label="User id"><input className="w-id" value={userId} onChange={(e) => { setPage(0); setUserId(e.target.value) }} placeholder="show one user only (optional)" /></Field>
        <Field label="Show"><Select value={active} onChange={(v) => { setPage(0); setActive(v) }} options={[{ value: 'true', label: 'Only warnings that still count' }, { value: 'false', label: 'Only old warnings' }]} emptyLabel="(all warnings)" /></Field>
        <button className="secondary" onClick={reload} title="GET /api/v1/admin/safety/strikes">Refresh the list</button>
        <button onClick={() => setIssueOpen(true)} title="POST /api/v1/admin/safety/users/{userId}/strikes">+ Give a warning</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'issuedAt', label: 'Given at' },
          { key: 'userId', label: 'User', render: (r) => <Id v={r.userId} /> },
          { key: 'reason', label: 'Reason' },
          { key: 'reportId', label: 'Linked report', render: (r) => r.reportId ? <Link to={`/safety/reports/${r.reportId}`}><Id v={r.reportId} /></Link> : <span className="muted">—</span> },
          { key: 'active', label: 'Still counts?' },
          { key: 'expiresAt', label: 'Ends at' },
          { key: '_days', label: 'Days left', render: (r) => { const d = daysLeft(r); return d != null ? `${d}` : <span className="muted">ended</span> } },
          { key: '_', label: '', render: (r) => r.active ? <button className="small danger" onClick={() => setRevoke(r)} title="DELETE /api/v1/admin/safety/strikes/{strikeId}">Cancel this warning</button> : null },
        ]}
        rows={pageRows(data)}
        loading={loading}
        empty="No warnings found. Nothing to do here right now."
      />
      <Pager data={data} page={page} onPage={setPage} />
      <Note>
        Warnings are never deleted from this list. Cancelling one just makes it stop counting today.
        The total under the list can still include old warnings, even when you filter by "still counts".
      </Note>

      {issueOpen && (
        <FormModal title="Give a warning"
          intro="The warning counts for 90 days. The user gets an 'Account warning' message with your reason text. Careful: the user id is not checked — a typo puts the warning on nobody. You will be asked for the extra password check (step-up)."
          fields={[
            { name: 'userId', label: 'User id *', required: true, value: userId, placeholder: 'paste the user id (UUID)' },
            { name: 'reason', label: 'Reason the user will see * (up to 200 letters)', type: 'textarea', required: true, placeholder: 'Example: Bullying in post replies' },
            { name: 'reportId', label: 'Linked report id (optional)', placeholder: 'ties the warning to a report, for appeals' },
          ]}
          submitLabel="Give the warning"
          onSubmit={async (v) => { await SafetyApi.issueStrike(v.userId, { reason: v.reason, reportId: v.reportId }); act.setOk('Done. The warning is given.'); reload() }}
          onClose={() => setIssueOpen(false)} />
      )}
      {revoke && (
        <FormModal title="Cancel this warning" danger
          intro="This makes the warning stop counting right now. The row stays in the list as history. You will be asked for the extra password check (step-up)."
          fields={[{ name: 'note', label: 'Why are you cancelling it?', type: 'textarea', placeholder: 'Example: Given by mistake.' }]}
          submitLabel="Cancel the warning"
          onSubmit={async (v) => { await SafetyApi.revokeStrike(revoke.id, v.note); act.setOk('Done. The warning no longer counts.'); reload() }}
          onClose={() => setRevoke(null)} />
      )}
    </div>
  )
}
