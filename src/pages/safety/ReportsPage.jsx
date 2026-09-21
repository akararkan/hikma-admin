import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SafetyApi } from '../../api'
import { useLoad } from '../../util'
import { PageIntro, HowTo, Tiles, DataTable, Err, Note, Field, Select, StatusBadge, Badge, Id } from '../../components/ui'

export const REPORT_STATES = ['SUBMITTED', 'TRIAGED', 'ACTIONED', 'DISMISSED', 'APPEALED', 'UPHELD', 'REVERSED']
export const REPORT_REASONS = ['SPAM', 'HARASSMENT', 'HATE_SPEECH', 'MISINFORMATION', 'NUDITY_SEXUAL', 'VIOLENCE', 'IMPERSONATION', 'SELF_HARM', 'COPYRIGHT', 'OTHER']
export const TARGET_TYPES = ['USER', 'POST', 'COMMENT', 'RESEARCH', 'QUESTION', 'ANSWER', 'MESSAGE', 'CHANNEL', 'STORY']
const PRIORITY = ['SELF_HARM', 'VIOLENCE']

// Plain-word labels for the raw enum values. The value sent to the server never changes.
export const STATE_OPTIONS = [
  { value: 'SUBMITTED', label: 'New — nobody looked yet (SUBMITTED)' },
  { value: 'TRIAGED', label: 'First check done (TRIAGED)' },
  { value: 'ACTIONED', label: 'We took action (ACTIONED)' },
  { value: 'DISMISSED', label: 'Closed — no problem found (DISMISSED)' },
  { value: 'APPEALED', label: 'Reporter asked us to look again (APPEALED)' },
  { value: 'UPHELD', label: 'Second look — decision kept (UPHELD)' },
  { value: 'REVERSED', label: 'Second look — decision undone (REVERSED)' },
]
export const REASON_OPTIONS = [
  { value: 'SPAM', label: 'Spam' },
  { value: 'HARASSMENT', label: 'Bullying (HARASSMENT)' },
  { value: 'HATE_SPEECH', label: 'Hate speech' },
  { value: 'MISINFORMATION', label: 'False information (MISINFORMATION)' },
  { value: 'NUDITY_SEXUAL', label: 'Nudity or sexual content' },
  { value: 'VIOLENCE', label: 'Violence' },
  { value: 'IMPERSONATION', label: 'Fake account (IMPERSONATION)' },
  { value: 'SELF_HARM', label: 'Self-harm' },
  { value: 'COPYRIGHT', label: 'Stolen work (COPYRIGHT)' },
  { value: 'OTHER', label: 'Other' },
]
export const TARGET_OPTIONS = [
  { value: 'USER', label: 'A user' },
  { value: 'POST', label: 'A post' },
  { value: 'COMMENT', label: 'A comment' },
  { value: 'RESEARCH', label: 'A research paper' },
  { value: 'QUESTION', label: 'A question' },
  { value: 'ANSWER', label: 'An answer' },
  { value: 'MESSAGE', label: 'A private message' },
  { value: 'CHANNEL', label: 'A channel' },
  { value: 'STORY', label: 'A story' },
]

// Time limits (SLA) for the first check, in hours, per reason class (docs §8).
const TRIAGE_LIMIT_HOURS = {
  SELF_HARM: 4, VIOLENCE: 4,
  HATE_SPEECH: 24, HARASSMENT: 24, NUDITY_SEXUAL: 24, IMPERSONATION: 24,
  SPAM: 48, MISINFORMATION: 48, COPYRIGHT: 48, OTHER: 48,
}

function ageHours(sqlTs) {
  if (!sqlTs) return null
  // firstSeen/lastSeen are SQL timestamps with a space, e.g. "2026-08-04 21:40:03.111222"
  const d = new Date(String(sqlTs).replace(' ', 'T'))
  if (isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / 3600000
}

/** Time-limit hint: how old the oldest report is vs the limit for its reason. */
function TimeLimit({ r }) {
  if (!['SUBMITTED', 'TRIAGED'].includes(r.state)) return <span className="muted">—</span>
  const h = ageHours(r.firstSeen)
  const limit = TRIAGE_LIMIT_HOURS[r.reason] || 48
  if (h == null) return <span className="muted">—</span>
  const age = h < 1 ? 'under 1 hour' : `${Math.floor(h)} hours`
  if (h > limit) return <Badge kind="err">Too late — {age} old, limit is {limit} hours</Badge>
  return <span>{age} old (limit {limit} hours)</span>
}

export default function ReportsPage() {
  const nav = useNavigate()
  const [f, setF] = useState({ state: undefined, targetType: undefined, reason: undefined })
  const [page, setPage] = useState(0)
  const [minCount, setMinCount] = useState('')
  const [reportId, setReportId] = useState('')
  const pageSize = 50
  const { data, err, loading, reload } = useLoad(
    () => SafetyApi.reports({ ...f, page, pageSize }),
    [JSON.stringify(f), page]
  )
  const stats = useLoad(() => SafetyApi.analytics({}), [])
  const all = data || []
  const rows = all
    .filter((r) => !minCount || (Number(r.reportCount) || 0) >= Number(minCount))
    .slice()
    .sort((a, b) => {
      const pa = PRIORITY.includes(a.reason) ? 0 : 1
      const pb = PRIORITY.includes(b.reason) ? 0 : 1
      return pa - pb
    })
  const urgent = rows.filter((r) => PRIORITY.includes(r.reason)).length
  const set = (k, v) => { setPage(0); setF((s) => ({ ...s, [k]: v })) }

  return (
    <div>
      <PageIntro
        title="User reports"
        lead="When people report a bad post, message, or user, the reports land here."
        bullets={[
          'You can see all open reports, grouped by the same item and reason.',
          'You can filter by status, by what was reported, and by the reason.',
          'You can see which reports are past their time limit (SLA).',
          'You can open one report to check it and make a decision.',
        ]}
      />
      <HowTo steps={[
        'Look at the top of the list first. Self-harm and violence reports are always on top. Their time limit is 4 hours.',
        'Reports about the same item and reason are grouped into one row. "How many people" tells you how many different people reported it.',
        'To open a report, paste its id in the "Open one report" box and press the button. (List rows show groups, so they have no single id.)',
        'On the report page you can do the first check, close it, or take action.',
      ]} />
      {stats.data && (
        <Tiles items={[
          { label: 'Reports waiting', value: stats.data.openQueue, sub: 'new + first check done' },
          { label: 'Appeals waiting', value: stats.data.appealBacklog, sub: 'reporter asked us to look again' },
          { label: 'Urgent rows on this page', value: urgent, sub: 'self-harm / violence' },
        ]} />
      )}
      <div className="filters">
        <Field label="Status"><Select value={f.state} onChange={(v) => set('state', v)} options={STATE_OPTIONS} emptyLabel="(waiting for review)" /></Field>
        <Field label="What was reported"><Select value={f.targetType} onChange={(v) => set('targetType', v)} options={TARGET_OPTIONS} emptyLabel="(anything)" /></Field>
        <Field label="Why it was reported"><Select value={f.reason} onChange={(v) => set('reason', v)} options={REASON_OPTIONS} emptyLabel="(any reason)" /></Field>
        <Field label="At least this many reports"><input type="number" min={0} value={minCount} onChange={(e) => setMinCount(e.target.value)} placeholder="any" /></Field>
        <button className="secondary" onClick={reload} title="GET /api/v1/admin/safety/reports">Refresh the list</button>
      </div>
      <div className="filters">
        <Field label="Open one report by its id">
          <input className="w-id" value={reportId} onChange={(e) => setReportId(e.target.value)} placeholder="paste the report id (UUID) here" />
        </Field>
        <button disabled={!reportId.trim()} onClick={() => nav(`/safety/reports/${reportId.trim()}`)}>Open this report</button>
      </div>
      <Err e={err} />
      <DataTable
        columns={[
          { key: 'reason', label: 'Why it was reported', render: (r) => <Badge kind={PRIORITY.includes(r.reason) ? 'err' : 'gray'}>{r.reason}</Badge> },
          { key: 'targetType', label: 'What was reported' },
          { key: 'targetRef', label: 'Item id', render: (r) => r.targetRef ? <Id v={r.targetRef} /> : <span className="muted">(open the report to see it)</span> },
          { key: 'reporterCount', label: 'How many people' },
          { key: 'reportCount', label: 'How many reports' },
          { key: 'state', label: 'Status', render: (r) => <StatusBadge value={r.state} /> },
          { key: 'firstSeen', label: 'First report' },
          { key: 'lastSeen', label: 'Latest report' },
          { key: '_sla', label: 'Time limit (SLA)', render: (r) => <TimeLimit r={r} /> },
        ]}
        rows={rows}
        rowKey={(r) => r.groupKey}
        loading={loading}
        empty="No reports match these filters. Nothing to do here right now."
      />
      <div className="row pager">
        {/* Rows are oldest first, so page 0 holds the oldest groups. */}
        <button className="small secondary" disabled={page <= 0} onClick={() => setPage(page - 1)}>← Older page</button>
        <span>Page {page + 1}</span>
        <button className="small secondary" disabled={all.length < pageSize} onClick={() => setPage(page + 1)}>Newer page →</button>
      </div>
      <Note>
        Rows are groups: one row for each item + reason pair, oldest first.
        Reports about private messages show no item id in this list — open the report to see it.
        The "at least this many reports" box filters only the page you see now.
      </Note>
    </div>
  )
}
