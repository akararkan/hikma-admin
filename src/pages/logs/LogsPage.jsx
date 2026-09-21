import React, { useState } from 'react'
import { LogsApi } from '../../api'
import { useLoad, useAction, pageRows, saveBlob, filenameFromDisposition, useDebounced } from '../../util'
import { DataTable, Pager, Err, Ok, Note, Loading, Field, Select, Tabs, Badge, StatusBadge, Modal, Confirm, JsonBlock, KV, Id, PageIntro, HowTo } from '../../components/ui'
import FormModal from '../../components/FormModal'

export default function LogsPage() {
  const [tab, setTab] = useState('explore')
  return (
    <div>
      <PageIntro
        title="System records"
        lead="This page shows records of what happened in the app. No one can delete these records by hand."
        bullets={[
          'You can search records from many places at once.',
          'You can see every login, including failed logins.',
          'You can set alert rules that watch the records for you.',
          'You can download records as a CSV file.',
          'You can see how long we keep each kind of record.',
        ]}
      />
      <Tabs tabs={[
        { id: 'explore', label: 'Search all records' },
        { id: 'logins', label: 'Logins' },
        { id: 'alerts', label: 'Automatic alerts' },
        { id: 'retention', label: 'How long we keep records' },
        { id: 'otp', label: 'Login codes (OTP)' },
      ]} active={tab} onChange={setTab} />
      {tab === 'explore' && <Explorer />}
      {tab === 'logins' && <LoginEvents />}
      {tab === 'alerts' && <Alerts />}
      {tab === 'retention' && <Retention />}
      {tab === 'otp' && <OtpStats />}
    </div>
  )
}

const STORES = [
  { value: 'audit', label: 'Actions (audit)' },
  { value: 'login', label: 'Logins' },
  { value: 'settings', label: 'Settings changes' },
  { value: 'consent', label: 'Permission choices (consent)' },
  { value: 'reports', label: 'User reports' },
]

const LOGIN_OUTCOMES = [
  { value: 'SUCCESS', label: 'Worked (SUCCESS)' },
  { value: 'FAILED', label: 'Failed (FAILED)' },
  { value: 'LOCKED', label: 'Account locked (LOCKED)' },
]

function Explorer() {
  const act = useAction()
  const [mode, setMode] = useState('simple') // simple filters | advanced search text
  const [q, setQ] = useState('')
  const [f, setF] = useState({ store: undefined, userId: '', ip: '', outcome: undefined, since: '', until: '', text: '' })
  const [result, setResult] = useState(null)
  const [detail, setDetail] = useState(null)
  const views = useLoad(() => LogsApi.views(), [])
  const [saveOpen, setSaveOpen] = useState(false)

  const composeQuery = () => {
    const parts = []
    if (f.userId.trim()) parts.push(`user:${f.userId.trim()}`)
    if (f.ip.trim()) parts.push(`ip:${f.ip.trim()}`)
    if (f.outcome) parts.push(`outcome:${f.outcome}`)
    if (f.store) parts.push(`store:${f.store}`)
    if (f.since) parts.push(`since:${f.since}`)
    if (f.until) parts.push(`until:${f.until}`)
    if (f.text.trim()) parts.push(`text:"${f.text.trim()}"`)
    return parts.join(' ')
  }
  const currentQuery = () => (mode === 'advanced' ? q.trim() : composeQuery())

  const run = async (queryOverride) => {
    const r = await act.run(() => {
      if (queryOverride !== undefined) return LogsApi.explore({ q: queryOverride || undefined, pageSize: 100 })
      if (mode === 'advanced') return LogsApi.explore({ q: q.trim() || undefined, pageSize: 100 })
      return LogsApi.explore({
        store: f.store, userId: f.userId.trim() || undefined, ip: f.ip.trim() || undefined,
        outcome: f.outcome, since: f.since || undefined, until: f.until || undefined,
        text: f.text.trim() || undefined, pageSize: 100,
      })
    })
    if (r) setResult(r)
  }

  const applyView = (v) => { setMode('advanced'); setQ(v.query); run(v.query) }

  const doExport = async () => {
    const { blob, headers } = await act.run(
      () => LogsApi.exportCsv(currentQuery()),
      'The CSV file downloaded. Note: this download itself was written to the action history.'
    ) || {}
    if (blob) saveBlob(blob, filenameFromDisposition(headers, 'log-export.csv'))
  }

  return (
    <div>
      <HowTo steps={[
        'Pick your filters below: a store, a user, a time range.',
        'Click "Search records".',
        'Click a row to see all its details.',
        'Click "Save this search" to keep it for next time. Saved searches show as small chips.',
        'Click "Download CSV" to export the rows as a file. You must pass the extra password check (step-up).',
      ]}>
        <p className="muted">
          Two stores need a user: "Actions (audit)" and "Permission choices (consent)".
          Without a user they are skipped, and a message under the results tells you.
          If you prefer, switch to "Search text" and type a query like <code>user:@alice store:login outcome:FAILED since:7d</code>.
          Time can be a date or a short form: <code>15m</code> = 15 minutes ago, <code>2h</code> = 2 hours, <code>7d</code> = 7 days.
        </p>
      </HowTo>
      <Tabs tabs={[
        { id: 'simple', label: 'Simple filters' },
        { id: 'advanced', label: 'Search text' },
      ]} active={mode} onChange={setMode} />
      {mode === 'simple' ? (
        <div className="filters">
          <Field label="Which store"><Select value={f.store} onChange={(v) => setF((s) => ({ ...s, store: v }))} options={STORES} emptyLabel="(all stores)" /></Field>
          <Field label="User (id or @name)"><input value={f.userId} onChange={(e) => setF((s) => ({ ...s, userId: e.target.value }))} className="w-id" placeholder="@alice or a user id" /></Field>
          <Field label="IP address"><input value={f.ip} onChange={(e) => setF((s) => ({ ...s, ip: e.target.value }))} className="w-sm" /></Field>
          <Field label="Login result"><Select value={f.outcome} onChange={(v) => setF((s) => ({ ...s, outcome: v }))} options={LOGIN_OUTCOMES} emptyLabel="(any)" /></Field>
          <Field label="From"><input type="datetime-local" value={f.since} onChange={(e) => setF((s) => ({ ...s, since: e.target.value }))} /></Field>
          <Field label="To"><input type="datetime-local" value={f.until} onChange={(e) => setF((s) => ({ ...s, until: e.target.value }))} /></Field>
          <Field label="Contains these words"><input value={f.text} onChange={(e) => setF((s) => ({ ...s, text: e.target.value }))} className="w-sm" /></Field>
        </div>
      ) : (
        <div className="toolbar">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder='Example: user:@alice store:login outcome:FAILED since:7d' style={{ flex: 1, minWidth: 340 }} onKeyDown={(e) => e.key === 'Enter' && run()} />
        </div>
      )}
      <div className="toolbar">
        <button disabled={act.busy} onClick={() => run()} title="GET /api/v1/admin/logs/explore">Search records</button>
        <button className="secondary" onClick={() => setSaveOpen(true)} disabled={!currentQuery()}>Save this search</button>
        <button className="secondary" disabled={act.busy || !currentQuery()} onClick={doExport} title="POST /api/v1/admin/logs/export">Download CSV (extra password check)</button>
      </div>
      <div className="toolbar">
        {(views.data || []).length > 0 && <span className="footnote">Saved searches:</span>}
        {(views.data || []).map((v) => (
          <span key={v.id} className="badge clickable" title={v.query} onClick={() => applyView(v)}>
            {v.name}
            <button className="link small" style={{ padding: '0 2px' }} title="Delete this saved search" onClick={async (e) => { e.stopPropagation(); await act.run(() => LogsApi.deleteView(v.id), 'Saved search deleted.'); views.reload() }}>✕</button>
          </span>
        ))}
      </div>
      <Err e={views.err} /><Err e={act.err} /><Ok msg={act.ok} />
      {result && (
        <>
          <div className="code-xs">{result.query}</div>
          {(result.notes || []).map((n, i) => <Note key={i}>{n}</Note>)}
          <DataTable
            columns={[
              { key: 'store', label: 'Where it came from', render: (r) => <Badge kind="blue">{r.store}</Badge> },
              { key: 'at', label: 'When' },
              { key: 'summary', label: 'What happened' },
              { key: 'fields', label: 'Details', render: (r) => <span className="case-preview">{JSON.stringify(r.fields)}</span> },
            ]}
            rows={result.rows || []}
            onRow={(r) => setDetail(r)}
            rowKey={(r) => `${r.store}-${r.at}-${r.summary}`}
            empty="No records match. Try a longer time range or fewer filters."
          />
        </>
      )}
      {detail && (
        <Modal title="One record" onClose={() => setDetail(null)}>
          <KV obj={{ 'Where it came from': detail.store, 'When': detail.at, 'What happened': detail.summary }} />
          <h3>All details</h3>
          <JsonBlock v={detail.fields} />
        </Modal>
      )}
      {saveOpen && (
        <FormModal title="Save this search"
          intro="The search is saved for you only. It shows as a chip you can click later."
          fields={[
            { name: 'name', label: 'Name for this search (80 letters max)', required: true },
            { name: 'query', label: 'Search text', value: currentQuery(), required: true },
          ]}
          submitLabel="Save"
          onSubmit={async (v) => { await LogsApi.saveView(v.name, v.query); act.setOk('Search saved.'); views.reload() }}
          onClose={() => setSaveOpen(false)} />
      )}
    </div>
  )
}

function LoginEvents() {
  const [f, setF] = useState({ userId: '', ip: '', outcome: undefined, from: '', to: '' })
  const [page, setPage] = useState(0)
  const df = useDebounced(f, 300)
  const { data, err, loading, reload } = useLoad(
    () => LogsApi.loginEvents({ userId: df.userId || undefined, ip: df.ip || undefined, outcome: df.outcome, from: df.from || undefined, to: df.to || undefined, page, size: 50 }),
    [JSON.stringify(df), page]
  )
  return (
    <div>
      <HowTo steps={[
        'Every login attempt is listed here, newest first.',
        'To watch one person, paste their user id in the "User id" box.',
        'To find attacks, pick "Failed (FAILED)" as the result and look for the same IP address many times.',
        'We only show the rough country or region, never an exact place.',
      ]} />
      <div className="filters">
        <Field label="User id"><input value={f.userId} onChange={(e) => { setPage(0); setF((s) => ({ ...s, userId: e.target.value })) }} className="w-id" /></Field>
        <Field label="IP address"><input value={f.ip} onChange={(e) => { setPage(0); setF((s) => ({ ...s, ip: e.target.value })) }} /></Field>
        <Field label="Result"><Select value={f.outcome} onChange={(v) => { setPage(0); setF((s) => ({ ...s, outcome: v })) }} options={LOGIN_OUTCOMES} emptyLabel="(any)" /></Field>
        <Field label="From"><input type="datetime-local" value={f.from} onChange={(e) => { setPage(0); setF((s) => ({ ...s, from: e.target.value })) }} /></Field>
        <Field label="To"><input type="datetime-local" value={f.to} onChange={(e) => { setPage(0); setF((s) => ({ ...s, to: e.target.value })) }} /></Field>
        <button className="secondary" onClick={reload} title="GET /api/v1/admin/logs/login-events">Refresh the list</button>
      </div>
      <Err e={err} />
      <DataTable
        columns={[
          { key: 'ts', label: 'When' },
          { key: 'userId', label: 'Who', render: (r) => r.userId ? <Id v={r.userId} /> : <span className="muted">unknown</span> },
          { key: 'method', label: 'How they signed in' },
          { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome} /> },
          { key: 'ip', label: 'IP address' },
          { key: 'coarseGeo', label: 'Country / region (rough)' },
          { key: 'userAgent', label: 'Device' },
        ]}
        rows={pageRows(data)}
        loading={loading}
        empty="No logins match. Try a wider time range or fewer filters."
      />
      <Pager data={data} page={page} onPage={setPage} />
    </div>
  )
}

const RULE_KINDS = [
  { value: 'FAILED_LOGIN_PER_ACCOUNT', label: 'Many failed logins for one account' },
  { value: 'FAILED_LOGIN_PER_IP', label: 'Many failed logins from one IP address' },
  { value: 'REPORT_PILE_ON', label: 'Many reports about the same thing' },
  { value: 'DLQ_ARRIVALS', label: 'Many failed messages (dead letters)' },
  { value: 'OTP_ABUSE', label: 'Too many login codes asked for' },
  { value: 'PURGE_JOB_SILENCE', label: 'The nightly delete job did not run' },
]
const kindLabel = (k) => (RULE_KINDS.find((r) => r.value === k)?.label || k)

const SEVERITIES = [
  { value: 'INFO', label: 'Low (INFO)' },
  { value: 'MEDIUM', label: 'Medium (MEDIUM)' },
  { value: 'HIGH', label: 'High (HIGH)' },
]

function Alerts() {
  const rules = useLoad(() => LogsApi.alerts(), [])
  const [page, setPage] = useState(0)
  const [since, setSince] = useState('')
  const [ruleId, setRuleId] = useState(undefined)
  const firings = useLoad(() => LogsApi.firings({ since: since || undefined, ruleId, page, size: 50 }), [page, since, ruleId])
  const act = useAction()
  const [createOpen, setCreateOpen] = useState(false)
  const [editRule, setEditRule] = useState(null)
  const [delRule, setDelRule] = useState(null)
  return (
    <div>
      <HowTo steps={[
        'The system checks these rules every 5 minutes.',
        'To add a rule, click "Add a rule", pick what to watch, and set a limit.',
        'Example: "Many failed logins for one account", limit 10, window 60 minutes.',
        'When a rule trips, it shows in the "Alerts that fired" list below, and admins get a notification.',
        'Adding or changing a rule asks for the extra password check (step-up).',
      ]} />
      <div className="card">
        <div className="card-head">
          <h2>Alert rules</h2>
          <button className="small" onClick={() => setCreateOpen(true)} title="POST /api/v1/admin/logs/alerts">Add a rule</button>
        </div>
        <Err e={rules.err} /><Err e={act.err} /><Ok msg={act.ok} />
        <DataTable
          columns={[
            { key: 'kind', label: 'What it watches', render: (r) => <div>{kindLabel(r.kind)}<div className="code-xs">{r.kind}</div></div> },
            { key: 'name', label: 'Name' },
            { key: 'threshold', label: 'Limit (how many)' },
            { key: 'windowMinutes', label: 'Time window (minutes)' },
            { key: 'severity', label: 'How serious', render: (r) => <Badge kind={r.severity === 'HIGH' ? 'err' : r.severity === 'MEDIUM' ? 'blue' : 'gray'}>{r.severity}</Badge> },
            { key: 'enabled', label: 'On?' },
            {
              key: '_', label: '', render: (r) => (
                <span className="row-actions">
                  <button className="small secondary" onClick={() => setEditRule(r)}>Change</button>
                  <button className="small danger" onClick={() => setDelRule(r)}>Delete</button>
                </span>
              )
            },
          ]}
          rows={rules.data || []}
          loading={rules.loading}
          empty="No rules yet. Click 'Add a rule' to make one."
        />
      </div>
      <div className="card">
        <h2>Alerts that fired</h2>
        <div className="filters">
          <Field label="From"><input type="datetime-local" value={since} onChange={(e) => { setPage(0); setSince(e.target.value) }} /></Field>
          <Field label="Only this rule"><Select value={ruleId} onChange={(v) => { setPage(0); setRuleId(v) }} options={(rules.data || []).map((r) => ({ value: r.id, label: r.name }))} emptyLabel="(all rules)" /></Field>
        </div>
        <Err e={firings.err} />
        <DataTable
          columns={[
            { key: 'firedAt', label: 'When' },
            { key: 'ruleKind', label: 'Which rule', render: (r) => <div>{kindLabel(r.ruleKind)}<div className="code-xs">{r.ruleKind}</div></div> },
            { key: 'severity', label: 'How serious', render: (r) => <Badge kind={r.severity === 'HIGH' ? 'err' : 'blue'}>{r.severity}</Badge> },
            { key: 'detail', label: 'What happened' },
          ]}
          rows={pageRows(firings.data)}
          loading={firings.loading}
          empty="No alerts have fired. That is good news."
        />
        <Pager data={firings.data} page={page} onPage={setPage} />
      </div>
      {createOpen && (
        <FormModal title="Add an alert rule"
          intro="Leave a box empty to use the normal value: limit 10, window 60 minutes, Medium."
          fields={[
            { name: 'kind', label: 'What to watch', type: 'select', options: RULE_KINDS, required: true },
            { name: 'name', label: 'Name (optional)' },
            { name: 'threshold', label: 'Limit — fire at this count', type: 'number' },
            { name: 'windowMinutes', label: 'Time window (minutes)', type: 'number' },
            { name: 'severity', label: 'How serious', type: 'select', options: SEVERITIES },
            { name: 'enabled', label: 'Turn the rule on now', type: 'checkbox', value: true },
          ]}
          submitLabel="Add rule (extra password check)"
          onSubmit={async (v) => { await LogsApi.createAlert(v); act.setOk('Rule added.'); rules.reload() }}
          onClose={() => setCreateOpen(false)} />
      )}
      {editRule && (
        <FormModal title={`Change rule "${editRule.name}"`}
          intro="You cannot change what the rule watches. Only the boxes you fill are changed."
          fields={[
            { name: 'name', label: 'Name', value: editRule.name },
            { name: 'threshold', label: 'Limit — fire at this count', type: 'number', value: editRule.threshold },
            { name: 'windowMinutes', label: 'Time window (minutes)', type: 'number', value: editRule.windowMinutes },
            { name: 'severity', label: 'How serious', type: 'select', options: SEVERITIES, value: editRule.severity },
            { name: 'enabled', label: 'Rule is on', type: 'checkbox', value: editRule.enabled },
          ]}
          submitLabel="Save changes (extra password check)"
          onSubmit={async (v) => { await LogsApi.updateAlert(editRule.id, v); act.setOk('Rule changed.'); rules.reload() }}
          onClose={() => setEditRule(null)} />
      )}
      {delRule && (
        <Confirm title="Delete this alert rule?"
          message={`The system will stop checking "${delRule.name}". Alerts that already fired stay in the list.`}
          confirmLabel="Delete this rule"
          busy={act.busy}
          onConfirm={async () => { await act.run(() => LogsApi.deleteAlert(delRule.id), 'Rule deleted.'); setDelRule(null); rules.reload() }}
          onClose={() => setDelRule(null)} />
      )}
    </div>
  )
}

function Retention() {
  const { data, err, loading } = useLoad(() => LogsApi.retention(), [])
  return (
    <div>
      <HowTo steps={[
        'Each row is one kind of record.',
        'Read "How long we keep it" to see when old rows go away.',
        'You do not need to do anything here. The clean-up jobs run by themselves.',
      ]} />
      <div className="card">
        <Note>
          No person can delete these records — there is no delete button anywhere.
          Old records are removed only by timers and nightly clean-up jobs, as this table shows.
        </Note>
        <Err e={err} />
        <DataTable
          columns={[
            { key: 'store', label: 'Record store' },
            { key: 'policy', label: 'How long we keep it' },
            { key: 'enforcedBy', label: 'What removes old rows' },
            { key: 'rows', label: 'Rows now (where easy to count)' },
          ]}
          rows={data || []}
          loading={loading}
          empty="The list did not load. Try again."
        />
      </div>
    </div>
  )
}

function OtpStats() {
  const [windowHours, setWindowHours] = useState(24)
  const [burstThreshold, setBurstThreshold] = useState(5)
  const { data, err, loading } = useLoad(() => LogsApi.otpStats({ windowHours, burstThreshold }), [windowHours, burstThreshold])
  return (
    <div className="card">
      <HowTo steps={[
        'These are counts of one-time login codes (OTP) sent by text or email.',
        'Pick how many hours to look back (up to 720 hours = 30 days).',
        'A "hot target" got many codes in that time. That can mean someone is attacking the account.',
        'We never store or show the real phone number or the code. Only a scrambled tag (hash).',
      ]} />
      <div className="filters">
        <Field label="Look back (hours, up to 720)"><input type="number" min={1} max={720} value={windowHours} onChange={(e) => setWindowHours(Number(e.target.value) || 24)} /></Field>
        <Field label="Hot target = at least this many codes"><input type="number" min={2} value={burstThreshold} onChange={(e) => setBurstThreshold(Number(e.target.value) || 5)} /></Field>
      </div>
      <Err e={err} /><Loading on={loading} />
      {data && (
        <>
          {data.note && <Note>{data.note}</Note>}
          <DataTable
            columns={[
              { key: 'purpose', label: 'Why the code was sent' },
              { key: 'issued', label: 'Codes sent' },
              { key: 'consumed', label: 'Codes used' },
              { key: 'maxedAttempts', label: 'Hit the try limit' },
            ]}
            rows={data.byPurpose || []}
            loading={loading}
            empty="No codes were sent in this time."
          />
          <h3>Hot targets (scrambled tags only — we cannot see the real number)</h3>
          <DataTable
            columns={[
              { key: 'destinationHash', label: 'Scrambled tag (hash)', render: (r) => <code>{r.destinationHash}</code> },
              { key: 'challenges', label: 'Codes in this time' },
            ]}
            rows={data.hotDestinations || []}
            loading={loading}
            empty="No target got an unusual number of codes. Nothing to worry about here."
          />
        </>
      )}
    </div>
  )
}
