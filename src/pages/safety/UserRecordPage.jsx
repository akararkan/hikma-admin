import React, { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { SafetyApi } from '../../api'
import { useAction, pageRows } from '../../util'
import { PageIntro, HowTo, DataTable, Err, Note, Loading, Field, StatusBadge, KV, Pager, Select, Id } from '../../components/ui'

const CONSENT_SCOPES = [
  { value: 'CONTACTS', label: 'Contacts (CONTACTS)' },
  { value: 'LOCATION', label: 'Location (LOCATION)' },
  { value: 'PHOTOS', label: 'Photos (PHOTOS)' },
]

export default function UserRecordPage() {
  const [sp] = useSearchParams()
  const [userId, setUserId] = useState(sp.get('userId') || '')
  const act = useAction()
  const [record, setRecord] = useState(null)
  const [consent, setConsent] = useState(null)
  const [scope, setScope] = useState(undefined)
  const [consentPage, setConsentPage] = useState(0)

  const load = async (cp = consentPage) => {
    // One run for both reads: a second run() would wipe the first call's error and
    // show a false green "Done." over a stale record.
    setRecord(null); setConsent(null)
    await act.run(async () => {
      setRecord(await SafetyApi.userRecord(userId))
      setConsent(await SafetyApi.consent(userId, scope ? { scope } : { page: cp, size: 25 }))
    })
  }

  const reportCols = [
    { key: 'createdAt', label: 'When' },
    { key: 'targetType', label: 'What was reported' },
    { key: 'reason', label: 'Why' },
    { key: 'state', label: 'Status', render: (r) => <StatusBadge value={r.state} /> },
    { key: 'resolution', label: 'Result' },
    { key: 'id', label: '', render: (r) => <Link to={`/safety/reports/${r.id}`}>Open</Link> },
  ]

  return (
    <div>
      <PageIntro
        title="One user's record"
        lead="See everything safety-related about one user in one place."
        bullets={[
          'You can see the user\'s warnings (strikes), old and current.',
          'You can see reports made about them, and reports they made.',
          'You can see their app permission history (consent) — read only.',
          'You can jump to their full admin action history.',
        ]}
      />
      <HowTo steps={[
        'Paste the user id in the box.',
        'Press "Load this user\'s record".',
        'To check one permission only (like Contacts), pick it in the second box before loading.',
        'The permission log is legal proof. Nobody can change or delete it — not even admins.',
      ]} />
      <div className="filters">
        <Field label="User id *"><input className="w-id" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="paste the user id (UUID)" /></Field>
        <Field label="Permission to check (optional)"><Select value={scope} onChange={setScope} options={CONSENT_SCOPES} emptyLabel="(show the full history)" /></Field>
        <button disabled={!userId || act.busy} onClick={() => { setConsentPage(0); load(0) }} title="GET /api/v1/admin/safety/users/{userId}/record">Load this user's record</button>
      </div>
      <Err e={act.err} />
      <Loading on={act.busy} />
      {record && (
        <>
          <div className="card">
            <h2>Warnings (strikes) — {record.activeStrikes} still count</h2>
            <DataTable
              columns={[
                { key: 'issuedAt', label: 'Given at' },
                { key: 'reason', label: 'Reason' },
                { key: 'active', label: 'Still counts?' },
                { key: 'expiresAt', label: 'Ends at' },
                { key: 'reportId', label: 'Linked report', render: (r) => r.reportId ? <Link to={`/safety/reports/${r.reportId}`}><Id v={r.reportId} /></Link> : <span className="muted">—</span> },
              ]}
              rows={record.strikes || []}
              empty="This user has no warnings."
            />
          </div>
          <div className="grid2">
            <div className="card">
              <h2>Reports about this user (latest 50)</h2>
              <DataTable columns={reportCols} rows={record.reportsAgainst || []} empty="Nobody has reported this user." />
            </div>
            <div className="card">
              <h2>Reports this user made (latest 50)</h2>
              <DataTable columns={reportCols} rows={record.reportsFiled || []} empty="This user has not reported anything." />
            </div>
          </div>
          <p>
            <Link to={`/logs/audit?userId=${userId}`}>→ See this user's full action history</Link>
          </p>
        </>
      )}
      {consent && (
        <div className="card">
          <h2>{scope ? `App permission — ${scope} (now)` : 'App permission history (consent)'}</h2>
          <Note>
            This log is legal proof of what the user allowed on their phone (contacts, location, photos).
            It is read-only. No admin can change or delete it.
          </Note>
          {scope
            ? <KV obj={{ 'Permission (scope)': consent.scope, 'Allowed right now?': consent.granted }} />
            : <>
              <DataTable
                columns={[
                  { key: 'occurredAt', label: 'When' },
                  { key: 'scope', label: 'Permission (scope)' },
                  { key: 'granted', label: 'Allowed?' },
                  { key: 'appVersion', label: 'App version' },
                ]}
                rows={pageRows(consent)}
                empty="No permission events for this user."
              />
              <Pager data={consent} page={consentPage} onPage={(p) => { setConsentPage(p); load(p) }} />
            </>}
        </div>
      )}
      {!record && !act.busy && (
        <Note>Type a user id above and press the button to see their record.</Note>
      )}
    </div>
  )
}
