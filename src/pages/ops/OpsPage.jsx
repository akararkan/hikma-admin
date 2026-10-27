import React, { useState } from 'react'
import { OpsApi } from '../../api'
import { useLoad, useAction, pageRows } from '../../util'
import { DataTable, Pager, Err, Ok, Note, Warn, Loading, Field, Select, Tabs, KV, JsonBlock, StatusBadge, Modal, Confirm, Tiles, PageIntro, HowTo, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'

export default function OpsPage() {
  const [tab, setTab] = useState('health')
  return (
    <div>
      <PageIntro
        title="System health"
        lead="See if every part of the system is working, and fix common problems."
        bullets={[
          'You can check that every part of the system is up.',
          'You can run, pause, and watch the background jobs.',
          'You can see failed messages and send them again or throw them away.',
          'You can check the cache (Redis) and delete safe parts of it.',
          'You can refill the chat search list.',
        ]}
      />
      <HowTo steps={[
        'Open "Is everything up?" first. Every row should say UP.',
        'If a row is red, read the "If this is red" column to see what breaks.',
        'Open "Background jobs" each morning. Last night\'s jobs should say SUCCESS.',
        'Open "Queues & failed messages". Waiting counts should be near zero.',
        'For a failed message, click "Send again" to retry it, or "Throw away" if it is bad.',
        'Some actions ask for your password again (step-up). That is normal.',
      ]} />
      <Tabs tabs={[
        { id: 'health', label: 'Is everything up?' },
        { id: 'jobs', label: 'Background jobs' },
        { id: 'queues', label: 'Queues & failed messages' },
        { id: 'redis', label: 'Cache (Redis)' },
        { id: 'config', label: 'Settings list (config)' },
        { id: 'media', label: 'Search refill' },
      ]} active={tab} onChange={setTab} />
      {tab === 'health' && <Health />}
      {tab === 'jobs' && <Jobs />}
      {tab === 'queues' && <Queues />}
      {tab === 'redis' && <Redis />}
      {tab === 'config' && <Config />}
      {tab === 'media' && <MediaPlane />}
    </div>
  )
}

/* Plain names + what breaks when each dependency is red (from the ops runbooks). */
const DEP_INFO = {
  postgres: { name: 'Main database (PostgreSQL)', ifDown: 'The whole app stops working.' },
  cassandra: { name: 'Big-data store (Cassandra)', ifDown: 'Posts, feeds, chat history and stories fail.' },
  redis: { name: 'Fast memory store (Redis)', ifDown: 'Live updates break and rate limits stop.' },
  rabbitmq: { name: 'Message queues (RabbitMQ)', ifDown: 'Notifications, analytics and media jobs stop quietly.' },
  elasticsearch: { name: 'Search engine (Elasticsearch)', ifDown: 'All search stops working.' },
  r2: { name: 'File storage (R2)', ifDown: 'Photo and video upload and download fail.' },
  mail: { name: 'Email sender (Resend)', ifDown: 'Emails stop. In-app notifications still work.' },
}

const SSE_LABELS = {
  auditAdmins: 'Admins watching the action history feed',
  chatUsers: 'People connected to chat',
  notificationUsers: 'People connected to notifications',
  activityUsers: 'People connected to activity updates',
  qnaTopics: 'Open Q&A topics',
  researchTopics: 'Open research topics',
  postTopics: 'Open post topics',
  storyTopics: 'Open story topics',
  storyTrayViewers: 'People watching the story tray',
}

function Health() {
  const health = useLoad(() => OpsApi.health(), [])
  const sse = useLoad(() => OpsApi.sse(), [])
  return (
    <div className="grid2">
      <div className="card">
        <h2>Is every system part up?</h2>
        <Note>Green (UP) means it answered our test. Red (DOWN) means it did not.</Note>
        <button className="small secondary" title="GET /api/v1/admin/ops/health" onClick={health.reload}>Check again</button>
        <Err e={health.err} /><Loading on={health.loading} />
        {health.data && (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>System part</th><th>Status</th><th>Answer time</th><th>Details</th><th>If this is red</th></tr></thead>
            <tbody>
              {Object.entries(health.data).map(([dep, v]) => (
                <tr key={dep}>
                  <td><strong>{DEP_INFO[dep]?.name || dep}</strong></td>
                  <td><StatusBadge value={v?.status || 'UNKNOWN'} /></td>
                  <td>{v?.latencyMs != null ? `${v.latencyMs}ms` : ''}</td>
                  <td className="code-xs">{v?.error || v?.note || (v?.queues ? JSON.stringify(v.queues) : '')}</td>
                  <td style={{ fontSize: 12 }}>{DEP_INFO[dep]?.ifDown || ''}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      <div className="card">
        <h2>Live connections (SSE)</h2>
        <Note>How many people are connected for live updates right now. Counts are per server. If we run more than one server, add them up.</Note>
        <button className="small secondary" title="GET /api/v1/admin/ops/sse" onClick={sse.reload}>Check again</button>
        <Err e={sse.err} /><Loading on={sse.loading} />
        {sse.data && <KV obj={Object.fromEntries(Object.entries(sse.data).map(([k, v]) => [SSE_LABELS[k] || k, v]))} />}
      </div>
    </div>
  )
}

function Jobs() {
  const jobs = useLoad(() => OpsApi.jobs(), [])
  const paused = useLoad(() => OpsApi.pausedJobs(), [])
  const act = useAction()
  const [runsFor, setRunsFor] = useState(null)
  const [runsPage, setRunsPage] = useState(0)
  const runs = useLoad(() => runsFor ? OpsApi.jobRuns(runsFor, { page: runsPage, size: 25 }) : Promise.resolve(null), [runsFor, runsPage])
  const [pauseTarget, setPauseTarget] = useState(null)
  const [pauseWarning, setPauseWarning] = useState(null)
  const refresh = () => { jobs.reload(); paused.reload() }

  return (
    <div>
      <Note>These jobs run on their own on a schedule. Check that last night's jobs say SUCCESS. "Run now" starts a job while you wait — it can take a while to answer.</Note>
      {pauseWarning && <Warn>{pauseWarning}</Warn>}
      <Err e={act.err} /><Ok msg={act.ok} />
      <Err e={jobs.err} /><Loading on={jobs.loading} />
      <DataTable
        columns={[
          { key: 'job', label: 'Job', render: (r) => <strong>{r.job}</strong> },
          { key: 'schedule', label: 'When it runs', render: (r) => <code>{r.schedule}</code> },
          { key: 'description', label: 'What it does' },
          { key: 'lastRun', label: 'Last run' },
          { key: 'lastOutcome', label: 'Result', render: (r) => r.lastOutcome ? <StatusBadge value={r.lastOutcome} /> : null },
          { key: 'lastDurationMs', label: 'How long (ms)' },
          { key: 'lastItemsProcessed', label: 'Items done' },
          {
            key: '_', label: 'Actions', render: (r) => {
              const isPaused = paused.data?.[r.job] === true
              return (
                <span className="row-actions">
                  <button className="small secondary" title="GET /api/v1/admin/ops/jobs/{job}/runs" onClick={() => { setRunsFor(r.job); setRunsPage(0) }}>History</button>
                  {r.triggerable && <button className="small" title="POST /api/v1/admin/ops/jobs/{job}/run" disabled={act.busy} onClick={async () => { await act.run(() => OpsApi.runJob(r.job), `"${r.job}" has finished. Open its history to see the result.`); refresh() }}>Run now</button>}
                  {paused.data && (r.job in paused.data) && (isPaused
                    ? <button className="small" title="POST /api/v1/admin/ops/jobs/{job}/resume" disabled={act.busy} onClick={async () => { await act.run(() => OpsApi.resumeJob(r.job), `"${r.job}" will run on its schedule again.`); setPauseWarning(null); refresh() }}>Start it again</button>
                    : <button className="small danger" onClick={() => setPauseTarget(r.job)}>Pause…</button>)}
                  {isPaused && <span className="badge err">paused</span>}
                </span>
              )
            }
          },
        ]}
        rows={jobs.data || []}
        loading={jobs.loading}
        empty="No jobs are set up."
      />
      {runsFor && (
        <Modal title={`Run history — ${runsFor}`} onClose={() => setRunsFor(null)} wide>
          <Err e={runs.err} /><Loading on={runs.loading} />
          <DataTable
            columns={[
              { key: 'startedAt', label: 'Started' },
              { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome} /> },
              { key: 'durationMs', label: 'How long (ms)' },
              { key: 'itemsProcessed', label: 'Items done' },
              { key: 'itemsFailed', label: 'Items failed' },
              { key: 'host', label: 'Server' },
              { key: 'triggeredBy', label: 'Started by', render: (r) => r.triggeredBy ? <Id v={r.triggeredBy} /> : <em className="muted">on schedule</em> },
              { key: 'error', label: 'Error' },
            ]}
            rows={pageRows(runs.data)}
            loading={runs.loading}
            empty="This job has not run yet."
          />
          <Pager data={runs.data} page={runsPage} onPage={setRunsPage} />
        </Modal>
      )}
      {pauseTarget && (
        <FormModal title={`Pause this job: ${pauseTarget}`} danger requireText="PAUSE"
          intro="The job will not run on its schedule until you start it again. Pausing clean-up or account-delete jobs delays deletion work that the law may require."
          fields={[]}
          submitLabel="Pause this job"
          onSubmit={async () => {
            const r = await OpsApi.pauseJob(pauseTarget)
            setPauseWarning(r?.warning || null)
            act.setOk(`"${pauseTarget}" is paused.`); refresh()
          }}
          onClose={() => setPauseTarget(null)} />
      )}
    </div>
  )
}

const DLQ_STATUS_OPTIONS = [
  { value: 'PARKED', label: 'Saved, not fixed yet (PARKED)' },
  { value: 'REQUEUED', label: 'Sent again (REQUEUED)' },
  { value: 'DISCARDED', label: 'Thrown away (DISCARDED)' },
]

function Queues() {
  const queues = useLoad(() => OpsApi.queues(), [])
  const [f, setF] = useState({ status: undefined, routingKey: '' })
  const [page, setPage] = useState(0)
  const dlq = useLoad(() => OpsApi.dlq({ status: f.status, routingKey: f.routingKey || undefined, page, size: 25 }), [JSON.stringify(f), page])
  const act = useAction()
  const [inspect, setInspect] = useState(null)
  const [discard, setDiscard] = useState(null)
  const [requeue, setRequeue] = useState(null)
  const refresh = () => { queues.reload(); dlq.reload() }

  const queueRows = queues.data
    ? Object.entries(queues.data).filter(([k]) => k !== 'note' && k !== 'dlqParked').map(([name, v]) => ({ name, ...(v || {}) }))
    : []

  return (
    <div>
      <div className="card">
        <h2>Message queues</h2>
        <Note>Messages wait in a queue until a worker reads them. "Waiting" should be near zero. "Readers" should be 1 or more. A queue with 0 readers is a problem.</Note>
        <button className="small secondary" title="GET /api/v1/admin/ops/queues" onClick={queues.reload}>Check again</button>
        <Err e={queues.err} /><Loading on={queues.loading} />
        {queues.data && (
          <>
            {queues.data.dlqParked != null && <Tiles items={[{ label: 'Failed messages saved below (parked)', value: queues.data.dlqParked }]} />}
            <DataTable
              columns={[
                { key: 'name', label: 'Queue', render: (r) => <code>{r.name}</code> },
                { key: 'messages', label: 'Waiting' },
                { key: 'consumers', label: 'Readers' },
                { key: 'declared', label: 'Set up?', render: (r) => r.declared === false ? <span className="badge err">not set up</span> : null },
                { key: 'error', label: 'Problem' },
              ]}
              rows={queueRows}
              loading={queues.loading}
              empty="No queue data."
            />
            {queues.data.note && <Note>{queues.data.note}</Note>}
          </>
        )}
      </div>
      <div className="card">
        <h2>Failed messages (dead letters)</h2>
        <Note>A message lands here after the system tried it 3 times and gave up. "Send again" retries it — the same side effects can happen again. "Throw away" deletes the message forever but keeps a record row. Message content may hold private user details — opening it is recorded.</Note>
        <div className="filters">
          <Field label="Status"><Select value={f.status} onChange={(v) => { setPage(0); setF((s) => ({ ...s, status: v })) }} options={DLQ_STATUS_OPTIONS} /></Field>
          <Field label="Message type (routing key)"><input value={f.routingKey} onChange={(e) => { setPage(0); setF((s) => ({ ...s, routingKey: e.target.value })) }} placeholder="exact match, e.g. post.social.reacted" /></Field>
          <button className="secondary" onClick={refresh}>Refresh the list</button>
        </div>
        <Err e={dlq.err} /><Err e={act.err} /><Ok msg={act.ok} />
        <Loading on={dlq.loading} />
        <DataTable
          columns={[
            { key: 'receivedAt', label: 'When it failed' },
            { key: 'routingKey', label: 'Message type (routing key)', render: (r) => <code>{r.routingKey}</code> },
            { key: 'originalQueue', label: 'Queue it came from' },
            { key: 'typeId', label: 'Kind', render: (r) => <code className="code-xs">{String(r.typeId || '').split('.').pop()}</code> },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
            {
              key: '_', label: 'Actions', render: (r) => (
                <span className="row-actions">
                  <button className="small secondary" onClick={() => setInspect(r)}>See content</button>
                  {r.status === 'PARKED' && <button className="small" title="POST /api/v1/admin/ops/queues/dlq/{id}/requeue" disabled={act.busy} onClick={() => setRequeue(r)}>Send again</button>}
                  {r.status !== 'DISCARDED' && <button className="small danger" title="DELETE /api/v1/admin/ops/queues/dlq/{id}" onClick={() => setDiscard(r)}>Throw away…</button>}
                </span>
              )
            },
          ]}
          rows={pageRows(dlq.data)}
          loading={dlq.loading}
          empty="No failed messages. Nothing to fix here."
        />
        <Pager data={dlq.data} page={page} onPage={setPage} />
      </div>
      {inspect && (
        <Modal title="Failed message — details" onClose={() => setInspect(null)} wide>
          <KV obj={{
            'Send path (exchange)': inspect.originalExchange,
            'Queue it came from': inspect.originalQueue,
            'Message type (routing key)': inspect.routingKey,
            'Kind (typeId)': inspect.typeId,
            'Status': inspect.status,
            'When it failed': inspect.receivedAt,
            'Fixed at': inspect.resolvedAt,
            'Fixed by': inspect.resolvedBy,
          }} />
          <h3>Extra info (headers)</h3><JsonBlock v={inspect.headersJson} />
          <h3>Message content</h3>
          <Note>This may hold private user details. Viewing it is recorded.</Note>
          <JsonBlock v={tryDecode(inspect.payloadB64)} />
        </Modal>
      )}
      {requeue && (
        <Confirm title="Send this message again?"
          message="The system will try this message one more time. The same side effects can happen again (for example, a notification may be sent). If it still fails, it comes back here as a new row."
          confirmLabel="Send it again"
          danger={false}
          busy={act.busy}
          onConfirm={async () => {
            const res = await act.run(() => OpsApi.dlqRequeue(requeue.id), null)
            if (res) act.setOk(`Sent again to ${res.requeuedTo}. ${res.note || ''}`)
            setRequeue(null); refresh()
          }}
          onClose={() => setRequeue(null)} />
      )}
      {discard && (
        <FormModal title="Throw away this failed message" danger requireText="DISCARD"
          intro="This deletes the message forever. The system will never try it again. We keep a record row for 90 days. You cannot undo this."
          fields={[]}
          submitLabel="Throw it away"
          onSubmit={async () => {
            const r = await OpsApi.dlqDiscard(discard.id)
            act.setOk(r?.note || 'Thrown away.'); refresh()
          }}
          onClose={() => setDiscard(null)} />
      )}
    </div>
  )
}
function tryDecode(b64) {
  if (!b64) return null
  try {
    const s = atob(b64)
    try { return JSON.parse(s) } catch { return s }
  } catch { return b64 }
}

/* Allowlisted flushable prefixes — plain names for the picker. */
const FLUSHABLE = [
  { value: 'irc:search:top:', label: 'Top searches cache (irc:search:top:)' },
  { value: 'irc:search:zero:', label: 'Empty-result searches cache (irc:search:zero:)' },
  { value: 'user-profile', label: 'User profile cache (user-profile)' },
  { value: 'settings:', label: 'User settings cache (settings:)' },
  { value: 'chat:presence:', label: 'Who-is-online cache (chat:presence:)' },
  { value: 'email-ctx:', label: 'Email context cache (email-ctx:)' },
  { value: 'trending:', label: 'Trending cache (trending:)' },
]

/* Plain labels for the Redis INFO keys the API whitelists. */
const REDIS_LABELS = {
  reachable: 'Can we reach it?',
  error: 'Problem',
  redis_version: 'Version',
  uptime_in_days: 'Days running',
  connected_clients: 'Connected programs',
  used_memory_human: 'Memory used',
  used_memory_peak_human: 'Most memory ever used',
  maxmemory_human: 'Memory limit (0B = no limit)',
  maxmemory_policy: 'What happens when memory is full',
  total_commands_processed: 'Commands handled (total)',
  instantaneous_ops_per_sec: 'Commands per second (now)',
  keyspace_hits: 'Cache found it (hits)',
  keyspace_misses: 'Cache missed it (misses)',
  evicted_keys: 'Keys pushed out (evicted)',
  expired_keys: 'Keys that timed out (expired)',
  hitRatio: 'Found-it rate (%)',
}

function Redis() {
  const { data, err, loading, reload } = useLoad(() => OpsApi.redis(), [])
  const act = useAction()
  const [prefix, setPrefix] = useState('')
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="grid2">
      <div className="card">
        <h2>Fast memory store (Redis) — status</h2>
        <button className="small secondary" title="GET /api/v1/admin/ops/redis" onClick={reload}>Check again</button>
        <Err e={err} /><Loading on={loading} />
        {data && <KV obj={Object.fromEntries(Object.entries(data).map(([k, v]) => [REDIS_LABELS[k] || (k.startsWith('db') ? `Keys in ${k}` : k), v]))} />}
      </div>
      <div className="card">
        <h2>Delete cached data (flush)</h2>
        <Warn>Deleting cached data makes the app slower for a short time while the cache rebuilds. Login and security data can never be deleted here — the server blocks it.</Warn>
        <div className="field">
          <span>Which cache to delete</span>
          <Select value={prefix} onChange={(v) => setPrefix(v || '')} options={FLUSHABLE} emptyLabel="(pick a cache)" />
        </div>
        <button className="danger mt-2" title="DELETE /api/v1/admin/ops/redis/keys?prefix=" disabled={!prefix || act.busy} onClick={() => setConfirm(true)}>Delete this cache…</button>
        <Err e={act.err} /><Ok msg={act.ok} />
        {confirm && (
          <FormModal title={`Delete every cached item under ${prefix}*`} danger requireText="FLUSH"
            intro="This deletes the cached copies, not the real data. The app rebuilds them, but it may be slower for a short time. You cannot undo this."
            fields={[]}
            submitLabel="Delete this cache"
            onSubmit={async () => {
              const r = await OpsApi.redisFlush(prefix)
              act.setOk(`Deleted ${r?.deleted ?? '?'} cached item(s) under ${r?.prefix}.`)
            }}
            onClose={() => setConfirm(false)} />
        )}
      </div>
    </div>
  )
}

function Config() {
  const act = useAction()
  const [config, setConfig] = useState(null)
  const reconciler = useLoad(() => OpsApi.reconciler(), [])
  return (
    <div className="grid2">
      <div className="card">
        <h2>Settings list (config)</h2>
        <Note>Shows the safe server settings. Secret values are never shown. Reading this list is recorded in the action history, and you may be asked for your password again (step-up).</Note>
        <button title="GET /api/v1/admin/ops/config" disabled={act.busy} onClick={async () => {
          const r = await act.run(() => OpsApi.config(), 'Settings loaded. This read was recorded.')
          if (r) setConfig(r)
        }}>Show the settings list</button>
        <Err e={act.err} /><Ok msg={act.ok} />
        {config?.permitAllWarning && <Warn>{config.permitAllWarning}</Warn>}
        {config && <KV obj={config} />}
      </div>
      <div className="card">
        <h2>Start-up database fix report (reconciler)</h2>
        <Note>When the app starts, it removes old database rules that would block new values. This report shows what happened at the last start.</Note>
        <Err e={reconciler.err} /><Loading on={reconciler.loading} />
        {reconciler.data && (
          <>
            <KV obj={{ 'Last run': reconciler.data.lastRunAt }} />
            <KV obj={reconciler.data.constraints} />
            {reconciler.data.note && <Note>{reconciler.data.note}</Note>}
          </>
        )}
      </div>
    </div>
  )
}

function MediaPlane() {
  const act = useAction()
  const [backfillResult, setBackfillResult] = useState(null)
  const [backfillRuns, setBackfillRuns] = useState(null)

  const loadBackfillRuns = async () => {
    const r = await act.run(() => OpsApi.jobRuns('chat-message-backfill', { page: 0, size: 10 }), 'Progress loaded.')
    if (r) setBackfillRuns(pageRows(r))
  }

  return (
    <div>
      <div className="card">
        <h2>Refill the chat search list (backfill)</h2>
        <Note>Chat search can miss old messages after a problem. This tool fills in only the missing ones, so it is safe to run more than once. It runs in the background — use "Check progress" to see how it went.</Note>
        <span className="row snug">
          <button disabled={act.busy} title="POST /api/v1/admin/ops/es/chat-messages/backfill" onClick={async () => {
            const r = await act.run(() => OpsApi.chatBackfill(), 'Refill started. It runs in the background.')
            if (r) setBackfillResult(r)
          }}>Start the refill</button>
          <button className="secondary" title="GET /api/v1/admin/ops/jobs/chat-message-backfill/runs" disabled={act.busy} onClick={loadBackfillRuns}>Check progress</button>
        </span>
        {backfillResult?.note && <Note>{backfillResult.note}</Note>}
        {backfillRuns && (
          <DataTable
            columns={[
              { key: 'startedAt', label: 'Started' },
              { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome} /> },
              { key: 'durationMs', label: 'How long (ms)' },
              { key: 'itemsProcessed', label: 'Messages added' },
              { key: 'itemsFailed', label: 'Failed' },
              { key: 'error', label: 'Error' },
            ]}
            rows={backfillRuns}
            empty="The refill has not run yet."
          />
        )}
      </div>
    </div>
  )
}
