import React, { useState } from 'react'
import { NotificationsApi } from '../../api'
import { useLoad, useAction, fmtNum } from '../../util'
import { PageIntro, HowTo, DataTable, Err, Ok, Note, Loading, Field, Badge, Tiles, Confirm } from '../../components/ui'

export default function NotificationsPage() {
  const [range, setRange] = useState({ from: '', to: '' })
  const stats = useLoad(() => NotificationsApi.stats({ from: range.from || undefined, to: range.to || undefined }), [JSON.stringify(range)])
  const types = useLoad(() => NotificationsApi.types(), [])
  // One action state per card, so each card shows only its own success or error banner.
  const digestAct = useAction()
  const tokenAct = useAction()
  const [askDigest, setAskDigest] = useState(false)
  const [tokenId, setTokenId] = useState('')
  const [askToken, setAskToken] = useState(false)

  const rows = stats.data?.byType || []
  const totalCreated = rows.reduce((a, r) => a + (Number(r.created) || 0), 0)
  const totalRead = rows.reduce((a, r) => a + (Number(r.read) || 0), 0)
  const overallPct = totalCreated > 0 ? Math.round((totalRead / totalCreated) * 1000) / 10 : null

  return (
    <div>
      <PageIntro
        title="Notifications"
        lead="See what alerts the app sends to users, and if people read them."
        bullets={[
          'You can see how many alerts the app sends, by type.',
          'You can see how many of them users read.',
          'You can look up every alert type and how it is delivered.',
          'You can run the daily trending email by hand.',
          'You can delete an old phone push token.',
        ]}
      />
      <HowTo steps={[
        'Pick a start date and an end date to set the time window. Empty boxes mean the last 30 days.',
        'Read the table. A low "Share read" number means users may not want that alert type.',
        'Scroll down to see the list of all alert types.',
        'Use "Run the trending email now" only if the daily 09:00 UTC run did not happen.',
      ]} />

      <div className="card">
        <h2>Alerts sent, and how many get read</h2>
        <div className="filters">
          <Field label="From"><input type="datetime-local" value={range.from} onChange={(e) => setRange((s) => ({ ...s, from: e.target.value }))} /></Field>
          <Field label="To"><input type="datetime-local" value={range.to} onChange={(e) => setRange((s) => ({ ...s, to: e.target.value }))} /></Field>
          <button className="secondary" onClick={stats.reload}>Refresh the list</button>
        </div>
        <Err e={stats.err} /><Loading on={stats.loading} />
        {stats.data && (
          <Tiles items={[
            { value: fmtNum(totalCreated), label: 'Alerts sent in this window' },
            { value: fmtNum(totalRead), label: 'Alerts read' },
            { value: overallPct != null ? `${overallPct}%` : '—', label: 'Share read (all types)' },
          ]} />
        )}
        {stats.data?.note && <Note>{stats.data.note}</Note>}
        <DataTable
          columns={[
            { key: 'type', label: 'Alert type (technical name)' },
            { key: 'created', label: 'How many we sent', render: (r) => fmtNum(r.created) },
            { key: 'read', label: 'How many were read', render: (r) => fmtNum(r.read) },
            { key: 'readRatePct', label: 'Share read', render: (r) => `${r.readRatePct}%` },
          ]}
          rows={rows}
          loading={stats.loading}
          empty="No alerts were sent in this time window. Try a wider window."
        />
      </div>

      <div className="card">
        <h2>All alert types (the registry)</h2>
        <Note>This list comes from the app code. It shows how each alert type is delivered. It does not change often.</Note>
        <Err e={types.err} /><Loading on={types.loading} />
        <DataTable
          columns={[
            { key: 'type', label: 'Alert type (technical name)' },
            { key: 'category', label: 'Group' },
            { key: 'prefCategory', label: 'User setting group', render: (r) => r.prefCategory ? <Badge>{r.prefCategory}</Badge> : <span className="muted">—</span> },
            { key: 'aggregable', label: 'Can join into one alert? (aggregable)' },
            { key: 'emailEligible', label: 'Can go by email?' },
            { key: 'note', label: 'Note' },
          ]}
          rows={types.data || []}
          loading={types.loading}
          empty="No alert types to show."
        />
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Daily trending email (digest)</h2>
          <Note>
            The app sends a "trending" email once a day at 09:00 UTC.
            You can run it again by hand. Each user still gets at most one trending email per day.
            But a re-run can add one extra alert inside the app inbox.
          </Note>
          <div className="row">
            <button className="secondary" disabled={digestAct.busy} title="POST /api/v1/admin/notifications/digest/run" onClick={() => setAskDigest(true)}>
              Run the trending email now
            </button>
          </div>
          <Err e={digestAct.err} /><Ok msg={digestAct.ok} />
          <p className="footnote">The job always runs for today. You cannot pick a past day.</p>
        </div>
        <div className="card">
          <h2>Phone push tokens</h2>
          <Note>
            Push messages to phones are not connected yet — the sender is off (No-op).
            The server only keeps a list of phone tokens.
            You can delete one token here, for example an old or abusive one.
          </Note>
          <div className="row">
            <input className="w-id" value={tokenId} onChange={(e) => setTokenId(e.target.value)} placeholder="Paste the token row id (UUID) — not the user id" />
            <button className="danger" disabled={!tokenId || tokenAct.busy} title="DELETE /api/v1/admin/notifications/push-tokens/{id}" onClick={() => setAskToken(true)}>
              Delete this push token
            </button>
          </div>
          <Err e={tokenAct.err} /><Ok msg={tokenAct.ok} />
        </div>
      </div>

      {askDigest && (
        <Confirm
          title="Run the trending email now?"
          message="This runs the daily trending email job right away. Each user still gets at most one trending email per day. A same-day re-run can add one extra alert in the app inbox."
          confirmLabel="Yes, run it now"
          danger={false}
          busy={digestAct.busy}
          onClose={() => setAskDigest(false)}
          onConfirm={async () => {
            await digestAct.run(() => NotificationsApi.digestRun(), 'The trending email job started. It runs in the background.')
            setAskDigest(false)
          }}
        />
      )}
      {askToken && (
        <Confirm
          title="Delete this push token?"
          message="This deletes the push token row from the server. The phone can register a new token later. Nothing else changes."
          confirmLabel="Yes, delete it"
          busy={tokenAct.busy}
          onClose={() => setAskToken(false)}
          onConfirm={async () => {
            const r = await tokenAct.run(() => NotificationsApi.purgePushToken(tokenId), 'The push token was deleted.')
            if (r !== undefined) setTokenId('')
            setAskToken(false)
          }}
        />
      )}
    </div>
  )
}
