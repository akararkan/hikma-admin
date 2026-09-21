import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AuditApi } from '../../api'
import { subscribeAudit } from '../../api/auditStream'
import { useAction, fmtDate } from '../../util'
import { DataTable, Err, Note, Warn, Field, Select, Tabs, StatusBadge, CursorPager, Badge, Modal, KV, PageIntro, HowTo } from '../../components/ui'

const OPERATIONS = [
  { value: 'READ', label: 'Looked at (READ)' },
  { value: 'CREATE', label: 'Made (CREATE)' },
  { value: 'UPDATE', label: 'Changed (UPDATE)' },
  { value: 'DELETE', label: 'Deleted (DELETE)' },
  { value: 'LOGIN', label: 'Signed in (LOGIN)' },
  { value: 'LOGOUT', label: 'Signed out (LOGOUT)' },
  { value: 'UPLOAD', label: 'Uploaded (UPLOAD)' },
  { value: 'SYSTEM', label: 'System job (SYSTEM)' },
  { value: 'OTHER', label: 'Other (OTHER)' },
]
const OUTCOMES = [
  { value: 'SUCCESS', label: 'Worked (SUCCESS)' },
  { value: 'REDIRECT', label: 'Sent to another page (REDIRECT)' },
  { value: 'CLIENT_ERROR', label: 'Caller error (CLIENT_ERROR)' },
  { value: 'SERVER_ERROR', label: 'Server error (SERVER_ERROR)' },
  { value: 'SYSTEM', label: 'System (SYSTEM)' },
]

const AUDIT_COLS = [
  { key: 'createdAt', label: 'When' },
  { key: 'username', label: 'Who', render: (r) => r.username || <em className="muted">not signed in</em> },
  { key: 'operation', label: 'Action' },
  { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome} /> },
  { key: 'path', label: 'Request', render: (r) => <code>{r.httpMethod} {r.path}</code> },
  { key: 'statusCode', label: 'Answer code (HTTP)' },
  { key: 'durationMs', label: 'How long (ms)' },
  { key: 'ipAddress', label: 'IP address' },
  { key: 'summary', label: 'Summary' },
  { key: 'errorCode', label: 'Error' },
]

/* Plain labels for the one-record modal — same fields, same order as the raw record. */
const DETAIL_FIELDS = [
  ['createdAt', 'When'],
  ['username', 'Who (username)'],
  ['userId', 'User id'],
  ['operation', 'Action'],
  ['outcome', 'Result'],
  ['httpMethod', 'Request type (GET, POST…)'],
  ['path', 'Request path'],
  ['queryString', 'Request query (the part after "?")'],
  ['statusCode', 'Answer code (HTTP)'],
  ['durationMs', 'How long (ms)'],
  ['ipAddress', 'IP address'],
  ['userAgent', 'Device (browser info)'],
  ['resourceType', 'Kind of item'],
  ['resourceId', 'Item id'],
  ['summary', 'Summary'],
  ['errorCode', 'Error'],
  ['id', 'Record id'],
]
function detailKV(d) {
  const out = {}
  for (const [k, label] of DETAIL_FIELDS) if (d[k] !== undefined) out[label] = d[k]
  return out
}

export default function AuditPage() {
  // Other pages deep-link here as /logs/audit?userId=… — honor it.
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState('user')
  const [userSeed, setUserSeed] = useState(searchParams.get('userId') || '')
  const [resSeed, setResSeed] = useState(null) // {type, id}
  const [detail, setDetail] = useState(null)

  const pivotUser = (uid) => { setDetail(null); setUserSeed(String(uid)); setTab('user') }
  const pivotResource = (type, id) => { setDetail(null); setResSeed({ type, id: String(id) }); setTab('resource') }

  return (
    <div>
      <PageIntro
        title="Admin action history"
        lead="This page shows every action in the app — by admins and by users. Nobody can delete or change these records."
        bullets={[
          'You can see everything one user did.',
          "You can see everything that happened to one item, like a post or a report.",
          'You can watch actions live, as they happen.',
        ]}
      />
      <Note>
        To look at the past, you must pick one user or one item first — there is no way to search everyone's past at once.
        The live view is the only view of everyone, and it only shows new events.
        Records older than 180 days delete themselves.
      </Note>
      <Tabs tabs={[
        { id: 'user', label: "One user's actions" },
        { id: 'resource', label: "One item's history" },
        { id: 'live', label: 'Live view (everyone)' },
      ]} active={tab} onChange={setTab} />
      {tab === 'user' && <PerUser key={`u-${userSeed}`} seed={userSeed} onOpen={setDetail} />}
      {tab === 'resource' && <PerResource key={`r-${resSeed ? resSeed.type + resSeed.id : ''}`} seed={resSeed} onOpen={setDetail} />}
      {tab === 'live' && <LiveTail onOpen={setDetail} />}
      {detail && (
        <Modal title="One record" onClose={() => setDetail(null)} wide>
          <KV obj={detailKV(detail)} />
          <div className="modal-actions">
            {detail.userId && (
              <button className="secondary" onClick={() => pivotUser(detail.userId)} title="GET /api/v1/admin/audit/users/{userId}">See all this user's actions</button>
            )}
            {detail.resourceType && detail.resourceId && (
              <button className="secondary" onClick={() => pivotResource(detail.resourceType, detail.resourceId)} title="GET /api/v1/admin/audit/resources/{type}/{id}">See this item's history</button>
            )}
            <button onClick={() => setDetail(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function PerUser({ seed, onOpen }) {
  const act = useAction()
  const [f, setF] = useState({ userId: seed || '', operation: undefined, outcome: undefined, from: '', to: '' })
  const [rows, setRows] = useState(null)
  const hasFilters = !!(f.operation || f.outcome || f.from || f.to)
  const load = async (cursor) => {
    const uid = f.userId.trim()
    const res = await act.run(() => hasFilters
      ? AuditApi.search({
          userId: uid, operation: f.operation, outcome: f.outcome,
          from: f.from || undefined, to: f.to || undefined, pageSize: 50, cursor,
        })
      : AuditApi.byUser(uid, { pageSize: 50, cursor }))
    if (res) setRows(cursor ? [...(rows || []), ...res] : res)
  }
  useEffect(() => { if (seed) load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <HowTo steps={[
        "Paste the user's id in the box. You can copy it from the All users page.",
        'Pick filters if you want: the action type, the result, or a time range.',
        'Click "Search".',
        'Click any row to see all its details.',
        'Click "Show more" to load older rows. With filters on, a short page does not mean the end — keep clicking until the list stops growing.',
      ]} />
      <div className="filters">
        <Field label="User id (needed)"><input value={f.userId} onChange={(e) => setF((s) => ({ ...s, userId: e.target.value }))} className="w-id" placeholder="Paste the user id here" /></Field>
        <Field label="Action type"><Select value={f.operation} onChange={(v) => setF((s) => ({ ...s, operation: v }))} options={OPERATIONS} emptyLabel="(any)" /></Field>
        <Field label="Result"><Select value={f.outcome} onChange={(v) => setF((s) => ({ ...s, outcome: v }))} options={OUTCOMES} emptyLabel="(any)" /></Field>
        <Field label="From"><input type="datetime-local" value={f.from} onChange={(e) => setF((s) => ({ ...s, from: e.target.value }))} /></Field>
        <Field label="To"><input type="datetime-local" value={f.to} onChange={(e) => setF((s) => ({ ...s, to: e.target.value }))} /></Field>
        <button disabled={!f.userId.trim() || act.busy} onClick={() => load()} title="GET /api/v1/admin/audit · GET /api/v1/admin/audit/users/{userId}">Search</button>
      </div>
      <Err e={act.err} />
      {rows && (
        <>
          {hasFilters && (
            <Note>
              The filters run after each page is fetched, so a page can look short or even empty
              while older matching rows still exist. Keep clicking "Show more" until nothing new loads.
            </Note>
          )}
          <DataTable columns={AUDIT_COLS} rows={rows} onRow={onOpen} loading={act.busy} tall empty={hasFilters ? 'Nothing in this page. Click "Show more" — older rows may still match.' : 'No actions found for this user in the last 180 days.'} />
          <CursorPager rows={rows} pageSize={1} onMore={(c) => load(c)} />
        </>
      )}
    </div>
  )
}

function PerResource({ seed, onOpen }) {
  const act = useAction()
  const [type, setType] = useState(seed ? seed.type : 'Post')
  const [id, setId] = useState(seed ? seed.id : '')
  const [rows, setRows] = useState(null)
  const load = async (cursor) => {
    const res = await act.run(() => AuditApi.byResource(type.trim(), id.trim(), { pageSize: 50, cursor }))
    if (res) setRows(cursor ? [...(rows || []), ...res] : res)
  }
  useEffect(() => { if (seed) load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <HowTo steps={[
        'Type what kind of item it is, then paste the item id.',
        'The kind must match exactly, with capital letters: Post, PostComment, Question, QuestionAnswer, Research, User, Notification, Report, UserStrike, Sound, Channel…',
        'Click "Load history".',
        'This is the only view that also shows visitors who were not signed in.',
      ]} />
      <div className="filters">
        <Field label="Kind of item (exact, with capitals)"><input value={type} onChange={(e) => setType(e.target.value)} className="w-sm" placeholder="Post" /></Field>
        <Field label="Item id"><input value={id} onChange={(e) => setId(e.target.value)} className="w-id" placeholder="Paste the item id here" /></Field>
        <button disabled={!type.trim() || !id.trim() || act.busy} onClick={() => load()} title="GET /api/v1/admin/audit/resources/{type}/{id}">Load history</button>
      </div>
      <Err e={act.err} />
      {rows && (
        <>
          <DataTable columns={AUDIT_COLS} rows={rows} onRow={onOpen} loading={act.busy} tall empty="No history for this item in the last 180 days. Check the kind and the id." />
          <CursorPager rows={rows} pageSize={1} onMore={(c) => load(c)} />
        </>
      )}
    </div>
  )
}

const STREAM_LABELS = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  open: 'Connected',
  error: 'Connection lost',
}

function LiveTail({ onOpen }) {
  const [state, setState] = useState({ rows: [], status: 'idle', lastEventAt: null })
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState([])
  const [filter, setFilter] = useState('')
  const [, setTick] = useState(0)
  useEffect(() => subscribeAudit((s) => { if (!paused) setState(s) }), [paused])
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t) }, [])
  const rows = (paused ? frozen : state.rows).filter((r) => {
    if (!filter) return true
    const s = filter.toLowerCase()
    return [r.path, r.username, r.operation, r.outcome, r.summary].some((v) => String(v || '').toLowerCase().includes(s))
  })
  const stale = state.status === 'open' && state.lastEventAt && (Date.now() - state.lastEventAt > 5 * 60 * 1000)
  return (
    <div>
      <HowTo steps={[
        'New actions appear at the top of the list the moment they happen, from every admin and user.',
        'Type in the filter box to only see matching rows. This does not change what is recorded.',
        'Click "Pause the list" to stop the list moving while you read. New events keep arriving in the background.',
        'Click any row to see all its details.',
      ]} />
      <div className="toolbar">
        <Badge kind={state.status === 'open' ? 'green' : state.status === 'error' ? 'err' : 'gray'}>{STREAM_LABELS[state.status] || state.status}</Badge>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Show only rows that contain…" className="w-id" />
        <button className="small secondary" onClick={() => { if (!paused) setFrozen(state.rows); setPaused(!paused) }}>{paused ? 'Start again' : 'Pause the list'}</button>
        <span className="footnote">
          {rows.length} event(s) in the list{state.lastEventAt ? ` · last event ${fmtDate(new Date(state.lastEventAt).toISOString())}` : ''}
        </span>
      </div>
      {state.status === 'error' && (
        <Note>The connection dropped. We keep trying to reconnect for you. Events that happened while offline are not replayed — find them with "One user's actions".</Note>
      )}
      {stale && (
        <Warn>No events for more than 5 minutes. If people are using the app right now, the stream may be broken — tell an engineer.</Warn>
      )}
      <DataTable columns={AUDIT_COLS} rows={rows.slice(0, 200)} onRow={onOpen} tall empty="Waiting for new events… Actions appear here the moment they happen." rowKey={(r) => r.id || `${r.createdAt}-${r.path}`} />
    </div>
  )
}
