import React, { useState } from 'react'
import { SearchApi, OpsApi, REINDEX_ENTITIES } from '../../api'
import { useLoad, useAction, pageRows, saveBlob } from '../../util'
import { DataTable, Err, Ok, Note, Warn, Loading, Field, Select, Tabs, JsonBlock, Badge, StatusBadge, PageIntro, HowTo } from '../../components/ui'
import FormModal from '../../components/FormModal'

export default function SearchOpsPage() {
  const [tab, setTab] = useState('health')
  return (
    <div>
      <PageIntro
        title="Search tools"
        lead="Check and fix the lists that power search in the app."
        bullets={[
          'You can check if each search list is healthy.',
          'You can rebuild a search list when it is broken or out of date.',
          'You can see what people search for the most.',
          'You can see searches that found nothing, so you know what is missing.',
        ]}
      />
      <HowTo steps={[
        'Open "Search list health" to see if each list matches the real data.',
        'If a list has a big difference (drift), open "Rebuild search lists".',
        'Rebuild that one list. Do it at a quiet time — searches for that content find nothing while it runs.',
        'Open "What people search for" to find searches that found nothing.',
      ]} />
      <Tabs tabs={[
        { id: 'health', label: 'Search list health' },
        { id: 'reindex', label: 'Rebuild search lists' },
        { id: 'analytics', label: 'What people search for' },
      ]} active={tab} onChange={setTab} />
      {tab === 'health' && <Health />}
      {tab === 'reindex' && <Reindex />}
      {tab === 'analytics' && <QueryAnalytics />}
    </div>
  )
}

function Health() {
  const indices = useLoad(() => SearchApi.indices(), [])
  const health = useLoad(() => SearchApi.health(), [])
  return (
    <div>
      <div className="card">
        <h2>The 8 search lists (indices)</h2>
        <Note>Each kind of content has its own search list. If a list is missing or empty, people cannot find that content.</Note>
        <Err e={indices.err} /><Loading on={indices.loading} />
        <DataTable
          columns={[
            { key: 'index', label: 'Search list', render: (r) => <code>{r.index}</code> },
            { key: 'exists', label: 'Does it exist?' },
            { key: 'docCount', label: 'How many items' },
            { key: 'error', label: 'Problem' },
          ]}
          rows={indices.data || []}
          loading={indices.loading}
          empty="No search lists found."
        />
      </div>
      <div className="card">
        <h2>Search list vs real data (drift) {health.data && <Badge kind={health.data.reachable ? 'green' : 'err'}>{health.data.reachable ? 'Search engine is up' : 'Search engine is DOWN'}</Badge>}</h2>
        <Note>This compares each search list with the real data. A difference (drift) of 0 is perfect. A big or lasting difference means the list needs a rebuild.</Note>
        <Err e={health.err} /><Loading on={health.loading} />
        {health.data?.driftMeaning && <Note>{health.data.driftMeaning}</Note>}
        <DataTable
          columns={[
            { key: 'index', label: 'Search list', render: (r) => <code>{r.index}</code> },
            { key: 'docCount', label: 'Items in the list' },
            { key: 'canonicalCount', label: 'Items in the real data', render: (r) => r.canonicalCount ?? <span className="muted">unknown</span> },
            { key: 'drift', label: 'Difference (drift)', render: (r) => r.drift != null ? <span className={r.drift === 0 ? 'num-ok' : 'num-bad'}>{r.drift}</span> : null },
            { key: 'driftNote', label: 'Note' },
            { key: 'error', label: 'Problem' },
          ]}
          rows={health.data?.indices || []}
          loading={health.loading}
          empty="No health data yet."
        />
      </div>
    </div>
  )
}

/* Plain names + what each rebuild scans (from the API docs). */
const REINDEX_INFO = {
  research: { name: 'Research papers', scans: 'every published research paper' },
  posts: { name: 'Posts', scans: 'every post (also fixes a broken list format)' },
  questions: { name: 'Questions', scans: 'every live question' },
  users: { name: 'People', scans: 'every active account' },
  channels: { name: 'Channels', scans: 'every live public channel' },
  answers: { name: 'Answers', scans: 'every live answer' },
  sounds: { name: 'Sounds & music', scans: 'the whole sound library' },
}

function Reindex() {
  const act = useAction()
  const [drop, setDrop] = useState(true)
  const [results, setResults] = useState({})
  const [confirm, setConfirm] = useState(null)
  const [allResult, setAllResult] = useState(null)
  const [runs, setRuns] = useState(null)

  const run = async (entity) => {
    const r = await act.run(() => SearchApi.reindex(entity, drop), `Rebuild of ${REINDEX_INFO[entity]?.name || entity} is done.`)
    if (r) setResults((s) => ({ ...s, [entity]: r }))
  }

  const loadRuns = async () => {
    const r = await act.run(() => OpsApi.jobRuns('search-reindex-all'), 'Progress loaded.')
    if (r) setRuns(pageRows(r))
  }

  return (
    <div>
      <Warn>A rebuild starts right away and can take a while. If "delete the list first" is on, people get empty search results for that content until the rebuild ends. Run rebuilds at a quiet time.</Warn>
      <Note>"Delete the list first" (drop) is also the repair path: it rebuilds the list with the correct format. Turning it off only refreshes the items and cannot fix a broken list.</Note>
      <Note>The chat messages list (irc-chat-messages) has no rebuild button on purpose. It fixes itself when messages change. A refill tool for it lives on the System health page.</Note>
      <div className="filters">
        <Field label="Delete the list first, then rebuild (drop)"><input type="checkbox" checked={drop} onChange={(e) => setDrop(e.target.checked)} /></Field>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Search list</th><th>What a rebuild scans</th><th>Start</th><th>Last result</th></tr></thead>
          <tbody>
            {REINDEX_ENTITIES.map((e) => (
              <tr key={e}>
                <td>{REINDEX_INFO[e]?.name || e} <code>irc-{e === 'questions' ? 'qna' : e}</code></td>
                <td>{REINDEX_INFO[e]?.scans}</td>
                <td><button className={drop ? 'small danger' : 'small'} disabled={act.busy} title={`POST /api/v1/admin/search/${e}/reindex`} onClick={() => setConfirm(e)}>Rebuild this list</button></td>
                <td>{results[e] ? <span className="code-xs">{results[e].note || `${results[e].documentsIndexed} items in ${results[e].durationMs}ms`}</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>Rebuild ALL search lists</h2>
        <Note>This rebuilds all 7 lists one by one, each with "delete first" on. It runs in the background. Click "Check progress" to see how it is going.</Note>
        <div className="row">
          <button className="danger" disabled={act.busy} title="POST /api/v1/admin/search/reindex-all" onClick={() => setConfirm('__all__')}>Rebuild all lists (extra password check)</button>
          <button className="secondary" disabled={act.busy} title="GET /api/v1/admin/ops/jobs/search-reindex-all/runs" onClick={loadRuns}>Check progress</button>
        </div>
        {allResult && <JsonBlock v={allResult} />}
        {runs && (
          <DataTable
            columns={[
              { key: 'startedAt', label: 'When it started' },
              { key: 'finishedAt', label: 'When it ended' },
              { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome} /> },
              { key: 'itemsProcessed', label: 'Lists done' },
              { key: 'itemsFailed', label: 'Lists failed' },
              { key: 'error', label: 'Problem' },
            ]}
            rows={runs}
            empty="No runs yet. Start a rebuild first."
          />
        )}
      </div>
      {confirm && (
        <FormModal
          title={confirm === '__all__' ? 'Rebuild ALL search lists' : `Rebuild the ${REINDEX_INFO[confirm]?.name || confirm} list`}
          danger requireText="REBUILD"
          intro={confirm === '__all__'
            ? 'This rebuilds all 7 search lists one by one, each with "delete first" on. Search results will be empty or partial for each list while its turn runs. It runs in the background.'
            : drop
              ? 'The list is DELETED first. People get empty or partial search results for this content until the rebuild ends.'
              : 'This only refreshes the items in the list. It cannot fix a broken list format.'}
          fields={[]}
          submitLabel="Start the rebuild"
          onSubmit={async () => {
            if (confirm === '__all__') {
              const r = await SearchApi.reindexAll()
              setAllResult(r); act.setOk('Rebuild of all lists has started in the background.')
            } else await run(confirm)
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

function QueryAnalytics() {
  const [scope, setScope] = useState('ALL')
  const [days, setDays] = useState(7)
  const top = useLoad(() => SearchApi.topQueries({ scope, days, limit: 50 }), [scope, days])
  const zero = useLoad(() => SearchApi.zeroResults({ scope, days, limit: 50 }), [scope, days])
  const qCols = [{ key: 'query', label: 'What they typed' }, { key: 'count', label: 'How many times' }]

  const downloadZero = () => {
    const rows = zero.data?.queries || []
    const csv = ['query,count', ...rows.map((r) => `"${String(r.query).replace(/"/g, '""')}",${r.count}`)].join('\n')
    saveBlob(new Blob([csv], { type: 'text/csv' }), `searches-with-no-results-${scope}-${days}d.csv`)
  }

  return (
    <div>
      <Note>These numbers are anonymous. We never store who searched — only the search words.</Note>
      <div className="filters">
        <Field label="Kind of content"><Select value={scope} onChange={(v) => setScope(v || 'ALL')} options={[
          { value: 'ALL', label: 'Everything (ALL)' },
          { value: 'POST', label: 'Posts (POST)' },
          { value: 'REEL', label: 'Reels (REEL)' },
          { value: 'QUESTION', label: 'Questions (QUESTION)' },
          { value: 'RESEARCH', label: 'Research papers (RESEARCH)' },
          { value: 'ANSWER', label: 'Answers (ANSWER)' },
          { value: 'USER', label: 'People (USER)' },
          { value: 'CHANNEL', label: 'Channels (CHANNEL)' },
          { value: 'SOUND', label: 'Sounds (SOUND)' },
          { value: 'MULTI', label: 'Combined search (MULTI)' },
        ]} allowEmpty={false} /></Field>
        <Field label="Days back (up to 7)"><input type="number" min={1} max={7} value={days} onChange={(e) => setDays(Number(e.target.value) || 7)} /></Field>
      </div>
      <div className="grid2">
        <div className="card">
          <h2>Top searches</h2>
          <Err e={top.err} /><Loading on={top.loading} />
          {top.data?.source && <Note>{top.data.source}</Note>}
          <DataTable columns={qCols} rows={top.data?.queries || []} loading={top.loading} empty="No searches logged yet. Nothing to show here." />
        </div>
        <div className="card">
          <h2>Searches that found nothing</h2>
          <Note>These searches got zero results. They show what people look for but cannot find.</Note>
          <Err e={zero.err} /><Loading on={zero.loading} />
          {zero.data?.note && <Note>{zero.data.note}</Note>}
          <DataTable columns={qCols} rows={zero.data?.queries || []} loading={zero.loading} empty="Good news: every search found something." />
          {(zero.data?.queries || []).length > 0 && (
            <button className="small secondary" onClick={downloadZero}>Download this list as a file (CSV)</button>
          )}
        </div>
      </div>
    </div>
  )
}
