import React, { useState } from 'react'
import { NotificationsApi } from '../../api'
import { useLoad, useAction, fmtNum } from '../../util'
import { PageIntro, HowTo, DataTable, Err, Ok, Note, Warn, Loading, Field, Tiles, StatusBadge, Id } from '../../components/ui'

// Plain-English names for the fixed outcome set the API returns.
const OUTCOME_LABELS = {
  QUEUED: 'Handed to the mail server',
  THROTTLED: 'Held back — too many too fast',
  DISABLED: 'User turned this email off',
  MUTED: 'User muted this type',
  NO_ADDRESS: 'User has no email address',
  SKIPPED: 'Skipped for another reason',
  FAILED: 'Failed (error)',
}

export default function EmailPage() {
  const [range, setRange] = useState({ from: '', to: '', tail: 25 })
  const stats = useLoad(
    () => NotificationsApi.emailStats({ from: range.from || undefined, to: range.to || undefined, tail: range.tail }),
    [JSON.stringify(range)]
  )
  const act = useAction()
  const [subject, setSubject] = useState('Email check')
  const [body, setBody] = useState('If you can read this, outgoing email works.')
  const d = stats.data

  return (
    <div>
      <PageIntro
        title="Email status"
        lead="Check if the emails we send reach users."
        bullets={[
          'You can see how many emails went out, and how many failed.',
          'You can read the newest lines of the email log.',
          'You can send a test email to your own address.',
        ]}
      />
      <HowTo steps={[
        'Look at the number tiles. "Failed" should be close to zero.',
        'Empty date boxes mean the last 7 days. Change them to look at other days.',
        'Check the log table to see why one email did not go out.',
        'To test the system, write a subject and a message, then click "Send a test email to me".',
      ]} />

      <div className="filters">
        <Field label="From"><input type="datetime-local" value={range.from} onChange={(e) => setRange((s) => ({ ...s, from: e.target.value }))} /></Field>
        <Field label="To"><input type="datetime-local" value={range.to} onChange={(e) => setRange((s) => ({ ...s, to: e.target.value }))} /></Field>
        <Field label="Log lines to show (up to 100)"><input type="number" min={1} max={100} value={range.tail} onChange={(e) => setRange((s) => ({ ...s, tail: Number(e.target.value) || 25 }))} /></Field>
        <button className="secondary" onClick={stats.reload}>Refresh the list</button>
      </div>
      <Err e={stats.err} /><Loading on={stats.loading} />
      {d && (
        <>
          {d.enabled === false && <Warn>Email is turned OFF on the server. No emails go out right now.</Warn>}
          <div className="card">
            <h2>What happened to each email in this window</h2>
            <Tiles items={Object.keys(OUTCOME_LABELS).map((k) => ({
              value: fmtNum(d.byOutcome?.[k] ?? 0),
              label: OUTCOME_LABELS[k],
              sub: k,
            }))} />
            <Note>
              "Held back" (THROTTLED) means we already emailed that person about the same thing
              a short time ago, so we did not send it again.
            </Note>
          </div>
          <div className="card">
            <h2>Newest email log lines (email_send_log)</h2>
            <DataTable
              columns={[
                { key: 'createdAt', label: 'When' },
                { key: 'kind', label: 'What kind of email' },
                { key: 'groupKey', label: 'Repeat-stop key (group key)' },
                { key: 'outcome', label: 'What happened', render: (r) => <StatusBadge value={r.outcome} /> },
                { key: 'recipientId', label: 'User id', render: (r) => <Id v={r.recipientId} /> },
                { key: 'error', label: 'Error message' },
              ]}
              rows={d.ledgerTail || []}
              loading={stats.loading}
              empty="No email log lines in this time window. That is normal when no emails were sent."
            />
          </div>
        </>
      )}

      <div className="card">
        <h2>Send a test email to me</h2>
        <Note>The test email goes only to your own admin address. The subject will start with [TEST].</Note>
        <div className="field"><span>Subject</span><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div className="field mt-2"><span>Message</span><textarea value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <button className="mt-2" disabled={act.busy || !subject || !body} title="POST /api/v1/admin/notifications/email/test" onClick={async () => {
          const r = await act.run(() => NotificationsApi.emailTest(subject, body), null)
          if (r) act.setOk(r.enabled
            ? `The test email is on its way to ${r.queuedTo}. Check your inbox.`
            : `Email is turned OFF on the server — nothing was sent. The try was written to the log for ${r.queuedTo}.`)
        }}>Send a test email to me</button>
        <Err e={act.err} /><Ok msg={act.ok} />
      </div>
    </div>
  )
}
