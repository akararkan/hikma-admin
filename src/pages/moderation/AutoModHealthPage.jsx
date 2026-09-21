import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AutoModApi } from '../../api'
import { useLoad, fmtDate, fmtNum } from '../../util'
import { DataTable, Tiles, Err, Note, Warn, Loading, Field, Select, KV, Badge, StatusBadge, SeriesBars, PageIntro, HowTo } from '../../components/ui'
import { REVIEW_STATUSES, STRICT_LABELS, fmtScore } from '../../components/moderation'
import { useAuth } from '../../auth/AuthContext'

const WINDOWS = [
  { value: '1', label: 'last hour' },
  { value: '6', label: 'last 6 hours' },
  { value: '24', label: 'last 24 hours' },
  { value: '72', label: 'last 3 days' },
  { value: '168', label: 'last 7 days' },
]

const BAND_KEYS = ['autoApproved', 'autoRejected', 'sentToReview', 'decidedByHuman']

/** Plain header names for the raw status values. The values themselves never change. */
const STATUS_HEADERS = {
  PENDING: 'AI still working (PENDING)',
  IN_REVIEW: 'Waiting for a person (IN_REVIEW)',
  APPROVED: 'Went live (APPROVED)',
  REJECTED: 'Stayed hidden (REJECTED)',
}

/** StatusBadge paints OPEN green — inverted for a breaker, where OPEN is the outage. */
const CIRCUIT_KIND = { CLOSED: 'green', HALF_OPEN: 'red', OPEN: 'err' }

const num = (v) => (v == null ? undefined : fmtNum(v))
const pct = (v) => (v == null || !Number.isFinite(Number(v)) ? undefined : `${Math.round(Number(v) * 10) / 10}%`)

export default function AutoModHealthPage() {
  const { user } = useAuth()
  const [windowHours, setWindowHours] = useState(24)
  const [fetchedAt, setFetchedAt] = useState(null)
  const { data, err, loading, reload } = useLoad(async () => {
    const r = await AutoModApi.metrics(windowHours)
    setFetchedAt(new Date().toISOString())
    return r
  }, [windowHours])

  useEffect(() => {
    const t = setInterval(reload, 60000)
    return () => clearInterval(t)
  }, [reload])

  const d = data || {}
  const model = d.model || {}
  const queue = d.queue || {}
  const bands = d.bands || {}
  const dataset = d.dataset || {}
  const labels = Array.isArray(d.labels) ? [...d.labels].sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0)) : []
  const sla = Array.isArray(d.sla) ? d.sla : []

  const bandSeries = Object.fromEntries(BAND_KEYS.filter((k) => bands[k] != null).map((k) => [k, Number(bands[k]) || 0]))
  const volumeRows = Object.entries(d.volume?.byEntityType || {}).map(([entityType, counts]) => {
    const c = counts && typeof counts === 'object' ? counts : {}
    return { entityType, counts: c, total: Object.values(c).reduce((s, v) => s + (Number(v) || 0), 0) }
  }).sort((a, b) => b.total - a.total)
  // Union of whatever the server actually sent, so a status outside REVIEW_STATUSES still gets a column.
  const seenStatuses = new Set(volumeRows.flatMap((r) => Object.keys(r.counts)))
  const statusKeys = REVIEW_STATUSES.filter((s) => seenStatuses.has(s))
    .concat([...seenStatuses].filter((s) => !REVIEW_STATUSES.includes(s)))

  const circuit = model.circuit ? String(model.circuit).toUpperCase() : null
  const imgCircuit = model.imageCircuit ? String(model.imageCircuit).toUpperCase() : null
  const analyst = user?.role === 'ANALYST'
  const analystHint = analyst ? 'The ANALYST role can only read this health page — the linked page will say no (403).' : undefined
  const modelHint = analyst ? 'The ANALYST role can read the version list; every button there will say no (403).' : undefined
  const autoDecided = pct(bands.autoDecidedPercent)

  return (
    <div>
      <PageIntro
        title="AI health check"
        lead="This page shows if the AI moderation is healthy and doing its job."
        bullets={[
          'You can see how much the AI decides on its own.',
          'You can see how many posts are waiting for a person.',
          'You can see if the AI computer (inference container) is up.',
          'You can pick a time window for the numbers.',
        ]}
      />
      <HowTo steps={[
        'Pick a time window at the top. All numbers count inside that window only.',
        'Look at "Decided by AI alone". High and steady is healthy. A sudden drop is bad.',
        'If "Waiting for a person" keeps growing, the rules may be too strict, or the AI is down.',
        'Red warning boxes tell you what is wrong and what to do.',
        'The page refreshes itself every 60 seconds.',
      ]} />

      <div className="filters">
        <Field label="Time window">
          <Select value={String(windowHours)} onChange={(v) => setWindowHours(Number(v) || 24)} options={WINDOWS} allowEmpty={false} />
        </Field>
        <button className="secondary" onClick={reload}>Refresh the list</button>
        <span className="footnote">
          {loading ? 'Refreshing…' : `Refreshes itself every 60 seconds${fetchedAt ? ` · last read ${fmtDate(fetchedAt)}` : ''}`}
        </span>
      </div>
      <div className="toolbar">
        <Link to="/moderation/review" title={analystHint}>→ New posts to check (AI)</Link>
        <Link to="/moderation/settings" title={analystHint}>→ AI rules</Link>
        <Link to="/moderation/model" title={modelHint}>→ AI versions</Link>
      </div>

      <Err e={err} />
      {/* Spinner only on the first read — a 60s poll must not blank the numbers an operator is watching. */}
      <Loading on={loading && !data} />

      {d.enabled === false && (
        <Warn>
          AI moderation is <strong>OFF</strong>. Nothing is being scored. Only the blocked-words list still
          stops content. Every other number on this page is old history.
        </Warn>
      )}
      {model.inferenceUp === false && (
        <Warn>
          The AI computer (inference container) is <strong>down</strong>. Content is <em>not</em> going out
          unchecked — held posts wait, and when their time runs out the fallback rule for each content type
          decides (FAIL_CLOSED keeps them hidden, FAIL_OPEN_SHADOW publishes and flags them). The backlog and
          the "past the time limit" count will both climb until the computer is back. Tell the ops team.
        </Warn>
      )}
      {circuit && circuit !== 'CLOSED' && (
        <Warn>
          The safety cut-out (circuit breaker) is <strong>{circuit}</strong>{model.inferenceUp
            ? ' even though the AI computer says it is healthy — it answers health checks but fails on real scoring. Often too little CPU under load, or unusually long text.'
            : ' — scoring calls stop fast instead of waiting on a dead computer.'}
        </Warn>
      )}
      {model.imageInferenceUp === false && (
        <Warn>
          The <strong>image AI</strong> (nudity check computer) is down. What happens now depends on the
          image fallback rule on the "AI rules" page. With <code>FAIL_OPEN_SHADOW</code> (the default),
          pictures keep publishing and pile into the queue marked <code>MODEL_UNAVAILABLE</code> — every one
          of them is live and <em>no model has seen it</em>. With <code>FAIL_CLOSED</code>, every picture and
          video upload on the whole platform is being refused right now — treat that as an incident.
          Fix the computer first (the queue stops growing), then work the unscored pictures: on the queue
          page pick kind "Image (uploaded picture)" and "Past the limit only".
          {model.imageInferenceError ? <> Last error: <code>{model.imageInferenceError}</code></> : null}
        </Warn>
      )}
      {imgCircuit && imgCircuit !== 'CLOSED' && (
        <Warn>
          The image AI's safety cut-out (circuit breaker) is <strong>{imgCircuit}</strong> — image scoring
          calls stop fast and fall to the fallback rule instead of waiting on a dead computer.
        </Warn>
      )}
      {model.registryInSync === false && (
        <Warn>
          Version mismatch: the AI computer is serving a <strong>different</strong> version than the one the
          version list says is active{model.residentVersion ? ` (running ${model.residentVersion}` : ''}
          {model.residentVersion && model.activeVersion?.version ? `, list says ${model.activeVersion.version})` : model.residentVersion ? ')' : ''}.
          Someone restarted it by hand, or a version switch never reached it. Fix it by promoting the active version again on the "AI versions" page.
        </Warn>
      )}
      {d.note && <Note>{d.note}</Note>}
      {d.warning && <Warn>{d.warning}</Warn>}

      {data && (
        <>
          <Tiles items={[
            {
              label: 'Decided by AI alone',
              value: autoDecided,
              sub: 'decided with no person — the most important number here',
            },
            { label: 'Sent to a person', value: num(bands.sentToReview) },
            { label: 'Decided by a person', value: num(bands.decidedByHuman) },
            { label: 'New content scored', value: num(d.volume?.submitted) },
            { label: 'Waiting for a person', value: num(queue.inReview) },
            { label: 'AI still working', value: num(queue.pending) },
            { label: 'Past the time limit (SLA)', value: num(queue.slaBreached), sub: 'the wait time ran out with no answer' },
            {
              label: 'Average answer time',
              value: model.avgLatencyMs != null ? `${fmtNum(model.avgLatencyMs)} ms` : undefined,
              sub: model.calls != null ? `${fmtNum(model.calls)} calls · ${fmtNum(model.failures ?? 0)} failed` : undefined,
            },
            { label: 'New examples not yet trained', value: num(dataset.untrained), sub: 'when this is big, start a new training run' },
            { label: 'Training examples', value: num(dataset.examples) },
            { label: 'Golden test cases', value: num(dataset.goldenCases) },
          ]} />

          <div className="grid2">
            <div className="card">
              <h2>Where the decisions went</h2>
              {Object.keys(bandSeries).length > 0
                ? <SeriesBars series={bandSeries} />
                : <div className="empty">Nothing was decided in this window.</div>}
              <div className="mt-2">
                {autoDecided
                  ? <><strong>{autoDecided}</strong> decided by the AI alone</>
                  : <span className="muted">the server did not report how much the AI decided alone</span>}
              </div>
              <Note>
                A healthy AI decides most content by itself and only sends people the hard cases. If{' '}
                <code>sentToReview</code> keeps growing, the limits are too strict for the traffic, or the
                AI got worse — the label table on the right shows which label is doing it.
              </Note>
            </div>

            <div className="card">
              <h2>Which labels flag the most content</h2>
              <DataTable
                columns={[
                  {
                    key: 'label', label: 'Label', render: (r) => (
                      <span className="row snug">
                        <span className="mono">{r.label ?? '—'}</span>
                        {STRICT_LABELS.has(String(r.label)) && (
                          <Badge kind="err">strict</Badge>
                        )}
                      </span>
                    )
                  },
                  { key: 'count', label: 'How many', render: (r) => num(r.count) ?? <span className="muted">—</span> },
                  { key: 'avgScore', label: 'Average score', render: (r) => <span className="mono">{fmtScore(r.avgScore)}</span> },
                ]}
                rows={labels}
                loading={loading}
                empty="No label activity in this window."
              />
              <div className="footnote">
                "Strict" labels (<code>threat</code>, <code>identity_hate</code>) have lower limits on purpose,
                so they flag content at smaller scores. A rise there is a more serious signal than a rise in <code>insult</code>.
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Time limit (SLA) by content type</h2>
            <DataTable
              columns={[
                { key: 'entityType', label: 'Content type', render: (r) => <code>{r.entityType ?? '—'}</code> },
                { key: 'total', label: 'Total', render: (r) => num(r.total) ?? <span className="muted">—</span> },
                { key: 'breached', label: 'Past the limit', render: (r) => (Number(r.breached) > 0 ? <Badge kind="err">{fmtNum(r.breached)}</Badge> : (num(r.breached) ?? <span className="muted">—</span>)) },
                {
                  key: 'withinSlaPercent', label: 'On time', render: (r) => {
                    const p = Number(r.withinSlaPercent)
                    if (r.withinSlaPercent == null || !Number.isFinite(p)) return <span className="muted">—</span>
                    return <Badge kind={p >= 99 ? 'green' : 'err'}>{pct(p)}</Badge>
                  }
                },
              ]}
              rows={sla}
              loading={loading}
              empty="No time-limit rows in this window."
            />
            <div className="footnote">
              One miss is just a slow request. Many misses on one content type mean its answer-time budget is
              too small for its text length, or the AI computer needs more power — raise that type's budget on
              the "AI rules" page, or give the AI more CPU.
            </div>
          </div>

          <div className="card">
            <h2>How much of each content type</h2>
            <DataTable
              columns={[
                { key: 'entityType', label: 'Content type', render: (r) => <code>{r.entityType}</code> },
                ...statusKeys.map((s) => ({
                  key: s,
                  label: STATUS_HEADERS[s] || s,
                  render: (r) => (r.counts[s] != null ? fmtNum(r.counts[s]) : <span className="muted">—</span>),
                })),
                { key: '_total', label: 'Total', render: (r) => <strong>{fmtNum(r.total)}</strong> },
              ]}
              rows={volumeRows}
              rowKey={(r) => r.entityType}
              loading={loading}
              empty="Nothing was sent in during this window."
            />
          </div>

          <div className="grid2">
            <div className="card">
              <h2>AI computers</h2>
              <div className="toolbar">
                <span>text scoring <StatusBadge value={model.inferenceUp == null ? 'UNKNOWN' : model.inferenceUp ? 'UP' : 'DOWN'} /></span>
                <span>training <StatusBadge value={model.trainingUp == null ? 'UNKNOWN' : model.trainingUp ? 'UP' : 'DOWN'} /></span>
                <span>version match {model.registryInSync == null
                  ? <Badge kind="gray">UNKNOWN</Badge>
                  : <Badge kind={model.registryInSync ? 'green' : 'err'}>{model.registryInSync ? 'IN SYNC' : 'MISMATCH'}</Badge>}</span>
                <span>safety cut-out {circuit
                  ? <Badge kind={CIRCUIT_KIND[circuit] || 'gray'}>{circuit}</Badge>
                  : <span className="muted">—</span>}</span>
              </div>
              <div className="toolbar">
                <span>image scoring <StatusBadge value={model.imageInferenceUp == null ? 'UNKNOWN' : model.imageInferenceUp ? 'UP' : 'DOWN'} /></span>
                <span>image safety cut-out {imgCircuit
                  ? <Badge kind={CIRCUIT_KIND[imgCircuit] || 'gray'}>{imgCircuit}</Badge>
                  : <span className="muted">—</span>}</span>
              </div>
              <KV obj={{
                residentVersion: model.residentVersion,
                calls: model.calls,
                failures: model.failures,
                avgLatencyMs: model.avgLatencyMs,
                imageModelVersion: model.imageModelVersion,
                imageCalls: model.imageCalls,
                imageFailures: model.imageFailures,
                imageAvgLatencyMs: model.imageAvgLatencyMs,
                imageInferenceError: model.imageInferenceError || undefined,
              }} />
              <div className="footnote">
                The image AI checks pictures for nudity. It has one fixed version — no training loop, no
                promote — so "version match" only speaks about the text AI.
              </div>
              <div className="footnote">
                Log prefixes for engineers: <code>[MODERATION]</code> <code>[MODERATION-SLA]</code> <code>[MODERATION-CB]</code>{' '}
                <code>[MODERATION-TRAIN]</code> <code>[MODERATION-CASSANDRA]</code> <code>[MODERATION-IMG]</code>
              </div>
            </div>

            <div className="card">
              <h2>Active version (what the version list says)</h2>
              {model.activeVersion
                ? <KV obj={model.activeVersion} />
                : <div className="empty">No active version reported.</div>}
              <div className="footnote">
                Compare <code>version</code> here with <code>residentVersion</code> on the left: the list says
                what should be running, <code>residentVersion</code> says what actually is.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
