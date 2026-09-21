import React, { useState } from 'react'
import { SafetyApi } from '../../api'
import { useLoad } from '../../util'
import { PageIntro, HowTo, Tiles, Err, Loading, KV, DataTable, Field, SeriesBars, Id } from '../../components/ui'
import { STATE_OPTIONS, REASON_OPTIONS } from './ReportsPage'

const REASON_LABELS = Object.fromEntries(REASON_OPTIONS.map((o) => [o.value, o.label]))
const STATE_LABELS = Object.fromEntries(STATE_OPTIONS.map((o) => [o.value, o.label]))

/** {SPAM: 17, ...} → {'Spam': 17, ...} — plain words around the raw numbers. */
function relabel(obj, labels) {
  if (!obj) return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[labels[k] || k] = v
  return out
}

/** [{day, count}] → {day: count} for the bar chart. */
function toSeries(arr) {
  if (!Array.isArray(arr)) return null
  return Object.fromEntries(arr.map((x) => [x.day, x.count]))
}

export default function SafetyAnalyticsPage() {
  const [range, setRange] = useState({ from: '', to: '' })
  const [days, setDays] = useState(30)
  const analytics = useLoad(() => SafetyApi.analytics({ from: range.from || undefined, to: range.to || undefined }), [JSON.stringify(range)])
  const blocks = useLoad(() => SafetyApi.blockStats({ days, top: 20 }), [days])
  const a = analytics.data
  const b = blocks.data

  return (
    <div>
      <PageIntro
        title="Safety numbers"
        lead="Counts and trends for reports, warnings, and blocks."
        bullets={[
          'You can see how many reports are waiting right now.',
          'You can see reports by reason and by status.',
          'You can see how often our decisions get undone on appeal.',
          'You can see who gets blocked the most — a strong warning sign.',
        ]}
      />
      <HowTo steps={[
        'Pick a start and end date to change the "reports by reason" numbers. The other numbers always show the current state.',
        'Watch the "Decisions undone" number. If it grows, our decisions are often wrong, or the rules are unclear.',
        'A user can be on the "most blocked users" list even when nobody reported them — check the top names on the "One user\'s record" page.',
      ]} />
      <div className="filters">
        <Field label="From"><input type="datetime-local" value={range.from} onChange={(e) => setRange((s) => ({ ...s, from: e.target.value }))} /></Field>
        <Field label="To"><input type="datetime-local" value={range.to} onChange={(e) => setRange((s) => ({ ...s, to: e.target.value }))} /></Field>
        <Field label="Days of block history"><input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value) || 30)} /></Field>
      </div>
      <Err e={analytics.err} /><Loading on={analytics.loading} />
      {a && (
        <>
          <Tiles items={[
            { label: 'Reports waiting', value: a.openQueue, sub: 'new + first check done' },
            { label: 'Appeals waiting', value: a.appealBacklog, sub: 'need a second look' },
            { label: 'Decisions undone', value: a.reversalRate != null ? `${a.reversalRate}%` : '—', sub: 'of decided appeals — lower is better' },
            { label: 'Warnings that still count', value: a.strikesActive },
            { label: 'Warnings given, last 30 days', value: a.strikesIssued30d },
          ]} />
          <div className="grid2">
            <div className="card">
              <h2>Reports by reason (in the chosen dates)</h2>
              <KV obj={relabel(a.byReason, REASON_LABELS)} />
            </div>
            <div className="card">
              <h2>Reports by status (all time)</h2>
              <KV obj={relabel(a.byState, STATE_LABELS)} />
            </div>
          </div>
        </>
      )}
      <h2>Blocks and mutes</h2>
      <p className="muted">A block means one user fully shut out another. A mute (restriction) means they limited them without a full block.</p>
      <Err e={blocks.err} /><Loading on={blocks.loading} />
      {b && (
        <>
          <Tiles items={[
            { label: 'All blocks ever', value: b.totalBlocks },
            { label: 'All mutes ever', value: b.totalRestrictions },
          ]} />
          <div className="grid2">
            <div className="card">
              <h2>Most blocked users</h2>
              <p className="muted">Many blocks is a strong warning sign, even with no report.</p>
              <DataTable columns={[
                { key: 'userId', label: 'User', render: (r) => <Id v={r.userId} /> },
                { key: 'inboundBlocks', label: 'How many people blocked them' },
              ]} rows={b.mostBlockedUsers || []} loading={blocks.loading} empty="No blocks yet." />
            </div>
            <div className="card">
              <h3>New blocks per day</h3>
              <SeriesBars series={toSeries(b.blocksPerDay)} />
              <h3>New mutes per day</h3>
              <SeriesBars series={toSeries(b.restrictionsPerDay)} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
