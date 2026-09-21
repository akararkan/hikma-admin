import React, { useState } from 'react'
import { AnalyticsApi } from '../../api'
import { useLoad, useAction, pageRows, saveBlob, filenameFromDisposition, fmtNum, fmtBytes } from '../../util'
import { PageIntro, HowTo, DataTable, Pager, Err, Ok, Note, Warn, Loading, Field, Select, Tabs, Tiles, KV, SeriesBars, JsonBlock, Badge } from '../../components/ui'

export default function AnalyticsPage() {
  const [tab, setTab] = useState('overview')
  return (
    <div>
      <PageIntro
        title="Numbers & charts"
        lead="See how the platform is doing, in simple numbers and charts."
        bullets={[
          'You can see how many people use the app each day.',
          'You can see how much new content people make.',
          'You can check the steps new users take, and who comes back.',
          'You can get a warning when a number changes in a strange way.',
          'You can download the numbers as a CSV file.',
        ]}
      />
      <HowTo steps={[
        'Start on the "Big picture" tab. It shows today\'s headline numbers.',
        'Use "New content" and "Activity" to see day-by-day charts.',
        'Use "New-user steps" to see how new people settle in, and who comes back later.',
        'Check "Unusual changes" if you got an alert. You can also change the alert limits there.',
        'Use "Totals & export" to re-run a day\'s totals or download a CSV file.',
        'All dates and days use UTC time.',
      ]} />
      <Tabs tabs={[
        { id: 'overview', label: 'Big picture' },
        { id: 'content', label: 'New content' },
        { id: 'engagement', label: 'Activity' },
        { id: 'trending', label: 'Trending tags' },
        { id: 'series', label: 'Chart any number' },
        { id: 'funnel', label: 'New-user steps' },
        { id: 'anomalies', label: 'Unusual changes' },
        { id: 'pipeline', label: 'Totals & export' },
      ]} active={tab} onChange={setTab} />
      {tab === 'overview' && <Overview />}
      {tab === 'content' && <Content />}
      {tab === 'engagement' && <Engagement />}
      {tab === 'trending' && <Trending />}
      {tab === 'series' && <Series />}
      {tab === 'funnel' && <FunnelRetention />}
      {tab === 'anomalies' && <Anomalies />}
      {tab === 'pipeline' && <Pipeline />}
    </div>
  )
}

const CONV_TYPE_LABELS = { DIRECT: 'Direct messages (DIRECT)', GROUP: 'Group chats (GROUP)', CHANNEL: 'Channels (CHANNEL)' }

/** {DIRECT: 8123, ...} → {'Direct messages (DIRECT)': 8123, ...} */
function relabel(obj, labels) {
  if (!obj) return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[labels[k] || k] = v
  return out
}

function Overview() {
  const { data, err, loading } = useLoad(() => AnalyticsApi.overview(), [])
  const o = data
  const stickiness = o && o.mau30d > 0 && o.dauToday >= 0 ? Math.round((o.dauToday / o.mau30d) * 1000) / 10 : null
  return (
    <div>
      <Err e={err} /><Loading on={loading} />
      {o && (
        <>
          <Tiles items={[
            { label: 'All users', value: fmtNum(o.totalUsers) },
            { label: 'New users today', value: fmtNum(o.signupsToday) },
            { label: 'Active today (DAU)', value: fmtNum(o.dauToday) },
            { label: 'Active last 30 days (MAU)', value: o.mau30d === -1 ? 'not available' : fmtNum(o.mau30d), sub: o.mau30d === -1 ? 'We could not read this number right now. Try again later.' : undefined },
            stickiness != null ? { label: 'Come-back rate (DAU ÷ MAU)', value: `${stickiness}%`, sub: 'higher is better' } : null,
            { label: 'Online right now', value: fmtNum(o.onlineNow) },
            { label: 'Live streams now', value: fmtNum(o.liveNow) },
            { label: 'Published research', value: fmtNum(o.publishedResearch), sub: `${fmtNum(o.totalResearch)} in total, all statuses` },
            { label: 'Questions', value: fmtNum(o.questions) },
            { label: 'Open reports', value: fmtNum(o.openReports), sub: `${fmtNum(o.appealBacklog)} appeals waiting` },
            { label: 'Storage used', value: fmtBytes(o.storageBytes) },
            { label: 'Gift coins (all time)', value: fmtNum(o.giftCoinsAllTime) },
          ]} />
          <div className="card">
            <h2>Chats by type</h2>
            <KV obj={relabel(o.conversationsByType, CONV_TYPE_LABELS)} />
          </div>
        </>
      )}
    </div>
  )
}

function WindowPicker({ window, setWindow }) {
  return (
    <div className="filters">
      <Field label="How many days to show (up to 365)"><input type="number" min={1} max={365} value={window} onChange={(e) => setWindow(Number(e.target.value) || 30)} /></Field>
    </div>
  )
}

function Content() {
  const [window, setWindow] = useState(30)
  const { data, err, loading } = useLoad(() => AnalyticsApi.content(window), [window])
  return (
    <div>
      <HowTo steps={[
        'Pick how many days to show. The charts count new things made each day.',
        'Days with no bar had nothing new that day.',
        'Read the note under the filter — it explains where each number comes from.',
      ]} />
      <WindowPicker window={window} setWindow={setWindow} />
      <Err e={err} /><Loading on={loading} />
      {data && (
        <>
          {data.note && <Note>{data.note}</Note>}
          <div className="grid2">
            <div className="card"><h2>New users per day</h2><SeriesBars series={data.signupsPerDay} /></div>
            <div className="card"><h2>New posts per day</h2><SeriesBars series={data.postCreatesPerDay} /></div>
            <div className="card">
              <h2>New reels per day</h2>
              <SeriesBars series={data.reelsPerDay} />
              <p className="footnote">A day showing -1 means we could not read that day.</p>
            </div>
            <div className="card"><h2>New research per day</h2><SeriesBars series={data.researchPerDay} /></div>
            <div className="card"><h2>New questions per day</h2><SeriesBars series={data.questionsPerDay} /></div>
          </div>
        </>
      )}
    </div>
  )
}

function Engagement() {
  const [window, setWindow] = useState(30)
  const { data, err, loading } = useLoad(() => AnalyticsApi.engagement(window), [window])
  return (
    <div>
      <HowTo steps={[
        'Pick how many days to show. These charts count what people did each day.',
        'The last day is today, so its bar is still growing.',
        'The note under the filter explains where these numbers come from.',
      ]} />
      <WindowPicker window={window} setWindow={setWindow} />
      <Err e={err} /><Loading on={loading} />
      {data && (
        <>
          {data.source && <Note>{data.source}</Note>}
          <div className="grid2">
            <div className="card"><h2>Active users per day (DAU)</h2><SeriesBars series={data.dauPerDay} /></div>
            <div className="card"><h2>Logins per day</h2><SeriesBars series={data.loginsPerDay} /></div>
            <div className="card"><h2>Failed logins per day</h2><SeriesBars series={data.failedLoginsPerDay} /></div>
            <div className="card"><h2>All actions per day</h2><SeriesBars series={data.activityPerDay} /></div>
            <div className="card"><h2>Reactions per day</h2><SeriesBars series={data.reactionsPerDay} /></div>
            <div className="card"><h2>Comments per day</h2><SeriesBars series={data.commentsPerDay} /></div>
            <div className="card"><h2>Reel watches per day</h2><SeriesBars series={data.reelWatchesPerDay} /></div>
            <div className="card"><h2>Searches per day</h2><SeriesBars series={data.searchesPerDay} /></div>
          </div>
        </>
      )}
    </div>
  )
}

function Trending() {
  const [scope, setScope] = useState('ALL')
  const { data, err, loading } = useLoad(() => AnalyticsApi.trending(scope, 50), [scope])
  return (
    <div>
      <HowTo steps={[
        'Pick a content type, or keep "ALL" for everything.',
        'The list shows the most-used tags right now. It refreshes about every 10 minutes.',
      ]} />
      <div className="filters">
        <Field label="Content type">
          <Select value={scope} onChange={(v) => setScope(v || 'ALL')} allowEmpty={false} options={[
            { value: 'ALL', label: 'Everything (ALL)' },
            { value: 'QUESTION', label: 'Questions (QUESTION)' },
            { value: 'RESEARCH', label: 'Research (RESEARCH)' },
            { value: 'POST', label: 'Posts (POST)' },
            { value: 'REEL', label: 'Reels (REEL)' },
          ]} />
        </Field>
      </div>
      <Err e={err} />
      <DataTable
        columns={[
          { key: 'rank', label: '#' },
          { key: 'tag', label: 'Tag', render: (r) => <code>#{r.tag}</code> },
          { key: 'usageCount', label: 'Times used' },
          { key: 'scope', label: 'Content type' },
        ]}
        rows={data || []}
        loading={loading}
        empty="No trending tags here. That is unusual — please tell an engineer."
      />
    </div>
  )
}

const SUGGESTED_METRICS = ['login.success', 'login.failed', 'activity.total', 'activity.POST_CREATED', 'activity.POST_REACTION', 'activity.POST_COMMENT', 'activity.REEL_WATCH', 'activity.GLOBAL_SEARCH', 'signups', 'research.created', 'questions.created', 'reports.submitted']

function Series() {
  const [metric, setMetric] = useState('login.success')
  const [window, setWindow] = useState(30)
  const [current, setCurrent] = useState(null)
  const act = useAction()
  return (
    <div className="card">
      <HowTo steps={[
        'Type a number name (metric), or pick one from the list that appears.',
        'Names can only use letters, digits, dot, dash, and underscore.',
        'Pick how many days to show, then press "Show chart".',
      ]} />
      <div className="filters">
        <Field label="Number to chart (metric name)"><input value={metric} onChange={(e) => setMetric(e.target.value)} className="w-id" list="metric-suggestions" /></Field>
        <datalist id="metric-suggestions">{SUGGESTED_METRICS.map((m) => <option key={m} value={m} />)}</datalist>
        <Field label="How many days"><input type="number" min={1} max={365} value={window} onChange={(e) => setWindow(Number(e.target.value) || 30)} /></Field>
        <button title="GET /api/v1/admin/analytics/series" disabled={!metric || act.busy} onClick={async () => {
          const r = await act.run(() => AnalyticsApi.series(metric, window), 'Chart loaded.')
          if (r) setCurrent(r)
        }}>Show chart</button>
      </div>
      <Err e={act.err} />
      {current && (
        <>
          {current.source && <Note>{current.source}</Note>}
          <h3>{current.metric} — last {current.windowDays} days</h3>
          <SeriesBars series={current.series} limit={60} />
        </>
      )}
    </div>
  )
}

function FunnelRetention() {
  const now = new Date()
  const defCohort = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const [cohort, setCohort] = useState(defCohort)
  const [weeks, setWeeks] = useState(12)
  const funnel = useLoad(() => AnalyticsApi.funnel(cohort), [cohort])
  const retention = useLoad(() => AnalyticsApi.retention(weeks), [weeks])
  const f = funnel.data
  return (
    <div>
      <div className="card">
        <h2>New-user steps (funnel)</h2>
        <p className="muted">Pick a month. For people who joined that month, we count each step they finished.</p>
        <HowTo steps={[
          'Type the month people joined, like 2026-07.',
          'Read the bars top to bottom. Each bar is one step: sign up, come back, finish profile, follow someone, post something.',
          'A big drop between two bars means many people stopped at that step.',
        ]} />
        <div className="filters">
          <Field label="Month people joined (YYYY-MM)"><input value={cohort} onChange={(e) => setCohort(e.target.value)} className="w-num" /></Field>
        </div>
        <Err e={funnel.err} /><Loading on={funnel.loading} />
        {f && (
          <>
            {f.note && <Note>{f.note}</Note>}
            <SeriesBars series={{
              '1 signed up': f.signedUp,
              '2 came back': f.firstSeen,
              '3 profile done': f.profileCompleted,
              '4 followed someone': f.firstFollow,
              '5 posted something': f.firstContent,
            }} />
          </>
        )}
      </div>
      <div className="card">
        <h2>Who comes back (people who joined the same week)</h2>
        <p className="muted">Each row is one group: everyone who joined in the same week. "Weeks later" shows how many of them were still active after that many weeks.</p>
        <HowTo steps={[
          'Pick how many weeks of groups to show (up to 26).',
          'Find a group by its join week. Then read down: does the "Share" number fall fast?',
          'A fast fall means people leave soon after joining.',
        ]} />
        <div className="filters">
          <Field label="How many weeks (up to 26)"><input type="number" min={1} max={26} value={weeks} onChange={(e) => setWeeks(Number(e.target.value) || 12)} /></Field>
        </div>
        <Err e={retention.err} /><Loading on={retention.loading} />
        {retention.data && (
          <>
            {retention.data.computedBy && <Note>{retention.data.computedBy}</Note>}
            <DataTable
              columns={[
                { key: 'cohortWeek', label: 'Week they joined' },
                { key: 'weekOffset', label: 'Weeks later' },
                { key: 'cohortSize', label: 'People in group' },
                { key: 'activeCount', label: 'Still active' },
                { key: 'retentionPct', label: 'Share', render: (r) => `${r.retentionPct}%` },
              ]}
              rows={retention.data.grid || []}
              loading={retention.loading}
              empty="No groups computed yet. The weekly job runs on Mondays. Check again after Monday."
            />
          </>
        )}
      </div>
    </div>
  )
}

function Anomalies() {
  const [page, setPage] = useState(0)
  const anomalies = useLoad(() => AnalyticsApi.anomalies({ page, size: 50 }), [page])
  const config = useLoad(() => AnalyticsApi.alertsConfig(), [])
  const act = useAction()
  const [edit, setEdit] = useState({ metric: '', zWarn: '', zAlert: '', minVolume: '', enabled: true })
  return (
    <div>
      <div className="card">
        <h2>Unusual changes we found</h2>
        <p className="muted">Every night we compare each number to its normal level from the last 28 days. Big jumps or drops (called anomalies) land here, and admins get a notification.</p>
        <Err e={anomalies.err} />
        <DataTable
          columns={[
            { key: 'day', label: 'Day' },
            { key: 'metric', label: 'Number (metric)' },
            { key: 'severity', label: 'How serious', render: (r) => <Badge kind={r.severity === 'ALERT' ? 'err' : 'blue'}>{r.severity}</Badge> },
            { key: 'z', label: 'How far from normal (z)' },
            { key: 'value', label: 'Value that day' },
            { key: 'mean', label: 'Normal level (28-day average)' },
            { key: 'sd', label: 'Normal spread (σ)' },
            { key: 'createdAt', label: 'When we found it' },
          ]}
          rows={pageRows(anomalies.data)}
          loading={anomalies.loading}
          empty="No unusual changes found. Nothing to do here right now."
        />
        <Pager data={anomalies.data} page={page} onPage={setPage} />
      </div>
      <div className="card">
        <h2>Alert limits for each number</h2>
        <p className="muted">"Warn at" and "Alert at" set how big a change must be before we tell you. "Ignore below" skips numbers that are too small to matter.</p>
        <HowTo steps={[
          'Click a row to copy it into the form below. Or type a metric name yourself.',
          'Set the limits. Leave a box empty to keep its current value.',
          '"Alert at" must be the same as or higher than "Warn at".',
          'Adding a new metric name also puts that number on the nightly watch list.',
          'Press "Save this limit".',
        ]} />
        <Err e={config.err} />
        <DataTable
          columns={[
            { key: 'metric', label: 'Number (metric)' },
            { key: 'zwarn', label: 'Warn at (zWarn)', render: (r) => r.zwarn ?? r.zWarn },
            { key: 'zalert', label: 'Alert at (zAlert)', render: (r) => r.zalert ?? r.zAlert },
            { key: 'minVolume', label: 'Ignore below (per day)' },
            { key: 'enabled', label: 'On?' },
          ]}
          rows={config.data || []}
          loading={config.loading}
          onRow={(r) => setEdit({ metric: r.metric, zWarn: String(r.zwarn ?? r.zWarn ?? ''), zAlert: String(r.zalert ?? r.zAlert ?? ''), minVolume: String(r.minVolume ?? ''), enabled: r.enabled !== false })}
          empty="No custom limits set. The built-in defaults are in use: warn at 2.5, alert at 3.5, ignore below 50 per day."
        />
        <h3>Change a limit</h3>
        <div className="filters">
          <Field label="Number (metric) *"><input value={edit.metric} onChange={(e) => setEdit((s) => ({ ...s, metric: e.target.value }))} /></Field>
          <Field label="Warn at (zWarn)"><input type="number" step="0.1" value={edit.zWarn} onChange={(e) => setEdit((s) => ({ ...s, zWarn: e.target.value }))} /></Field>
          <Field label="Alert at (zAlert)"><input type="number" step="0.1" value={edit.zAlert} onChange={(e) => setEdit((s) => ({ ...s, zAlert: e.target.value }))} /></Field>
          <Field label="Ignore below (per day)"><input type="number" value={edit.minVolume} onChange={(e) => setEdit((s) => ({ ...s, minVolume: e.target.value }))} /></Field>
          <Field label="On?"><input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit((s) => ({ ...s, enabled: e.target.checked }))} /></Field>
          <button title="PUT /api/v1/admin/analytics/alerts/{metric}" disabled={!edit.metric || act.busy} onClick={async () => {
            const body = { enabled: edit.enabled }
            if (edit.zWarn !== '') body.zWarn = Number(edit.zWarn)
            if (edit.zAlert !== '') body.zAlert = Number(edit.zAlert)
            if (edit.minVolume !== '') body.minVolume = Number(edit.minVolume)
            await act.run(() => AnalyticsApi.setAlert(edit.metric, body), 'Limit saved.')
            config.reload()
          }}>Save this limit</button>
        </div>
        <Err e={act.err} /><Ok msg={act.ok} />
      </div>
    </div>
  )
}

function Pipeline() {
  const act = useAction()
  const [rollupDate, setRollupDate] = useState('')
  const [backfill, setBackfill] = useState({ from: '', to: '' })
  const [sample, setSample] = useState({ day: '', type: '', limit: 50 })
  const [sampleResult, setSampleResult] = useState(null)
  const [dataset, setDataset] = useState('engagement')
  const [window, setWindow] = useState(30)

  return (
    <div>
      <HowTo steps={[
        'The daily totals job runs every night at 02:40 UTC by itself.',
        'If one day\'s numbers look wrong, re-run that day. Running it again is safe — it just rewrites the same numbers.',
        'To fill in older days, use "Fill in past days". Do at most 90 days at a time.',
        'To download numbers as a file, pick a data set and press "Download CSV file".',
        '"Look at raw events" shows what single users did. It needs the extra password check (step-up), and we record who looked.',
      ]} />
      <Err e={act.err} /><Ok msg={act.ok} />
      <div className="grid2">
        <div className="card">
          <h2>Re-run one day's totals (rollup)</h2>
          <p className="muted">Adds up one day again. Safe to repeat — it overwrites the same numbers.</p>
          <div className="filters">
            <Field label="Day (YYYY-MM-DD)"><input type="date" value={rollupDate} onChange={(e) => setRollupDate(e.target.value)} /></Field>
            <button title="POST /api/v1/admin/analytics/rollup/{date}/run" disabled={!rollupDate || act.busy} onClick={async () => {
              const r = await act.run(() => AnalyticsApi.rollupRun(rollupDate), null)
              if (r) act.setOk(`Done. Day ${r.day}: ${r.metricRowsWritten} numbers written.`)
            }}>Re-run this day</button>
          </div>
        </div>
        <div className="card">
          <h2>Fill in past days (backfill)</h2>
          <p className="muted">Rebuilds totals for a date range from the main database. At most 90 days per run. It can take a while — the server does every day before it answers. Please wait.</p>
          <div className="filters">
            <Field label="First day"><input type="date" value={backfill.from} onChange={(e) => setBackfill((s) => ({ ...s, from: e.target.value }))} /></Field>
            <Field label="Last day"><input type="date" value={backfill.to} onChange={(e) => setBackfill((s) => ({ ...s, to: e.target.value }))} /></Field>
            <button title="POST /api/v1/admin/analytics/backfill" disabled={!backfill.from || !backfill.to || act.busy} onClick={async () => {
              const r = await act.run(() => AnalyticsApi.backfill(backfill.from, backfill.to), null)
              if (r) act.setOk(`Done. ${r.daysProcessed} day(s) filled in, ${r.metricRowsWritten} numbers written.`)
            }}>Fill in these days</button>
          </div>
        </div>
        <div className="card">
          <h2>Look at raw events (extra password check)</h2>
          <Warn>This shows what single users did, one action at a time. Use it only to check that event tracking works. Every look is written to the admin action history.</Warn>
          <div className="filters">
            <Field label="Day (empty = today)"><input type="date" value={sample.day} onChange={(e) => setSample((s) => ({ ...s, day: e.target.value }))} /></Field>
            <Field label="Only this event type (optional)"><input value={sample.type} onChange={(e) => setSample((s) => ({ ...s, type: e.target.value }))} placeholder="GLOBAL_SEARCH" /></Field>
            <Field label="How many rows (up to 100)"><input type="number" min={1} max={100} value={sample.limit} onChange={(e) => setSample((s) => ({ ...s, limit: Number(e.target.value) || 50 }))} /></Field>
            <button title="GET /api/v1/admin/analytics/events/sample" disabled={act.busy} onClick={async () => {
              const r = await act.run(() => AnalyticsApi.eventsSample({ day: sample.day || undefined, type: sample.type || undefined, limit: sample.limit }), 'Sample loaded. This look-up was written to the action history.')
              if (r) setSampleResult(r)
            }}>Show a sample</button>
          </div>
          {sampleResult && <JsonBlock v={sampleResult} />}
        </div>
        <div className="card">
          <h2>Download numbers as a file (CSV)</h2>
          <p className="muted">The file opens in Excel or Google Sheets. Every download is noted in the action history.</p>
          <div className="filters">
            <Field label="Which numbers">
              <Select value={dataset} onChange={(v) => setDataset(v || 'engagement')} allowEmpty={false} options={[
                { value: 'engagement', label: 'Activity (engagement)' },
                { value: 'signups', label: 'New users (signups)' },
                { value: 'content', label: 'New content' },
              ]} />
            </Field>
            <Field label="How many days"><input type="number" min={1} max={365} value={window} onChange={(e) => setWindow(Number(e.target.value) || 30)} /></Field>
            <button title="GET /api/v1/admin/analytics/export" disabled={act.busy} onClick={async () => {
              const r = await act.run(() => AnalyticsApi.exportCsv(dataset, window), 'File downloaded.')
              if (r?.blob) saveBlob(r.blob, filenameFromDisposition(r.headers, `${dataset}-${window}d.csv`))
            }}>Download CSV file</button>
          </div>
        </div>
      </div>
    </div>
  )
}
