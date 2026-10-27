import React, { useState } from 'react'
import { FeedApi } from '../../api'
import { useLoad, useAction } from '../../util'
import { DataTable, Err, Ok, Note, Warn, Loading, Field, Tabs, Tiles, KV, Badge, Confirm, PageIntro, HowTo, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'

/* Field names must match the API exactly — only the labels are plain English. */
const KNOB_FIELDS = [
  { name: 'wLike', label: 'Points for a like (wLike)' },
  { name: 'wComment', label: 'Points for a comment (wComment)' },
  { name: 'wShare', label: 'Points for a share (wShare)' },
  { name: 'wSave', label: 'Points for a save (wSave)' },
  { name: 'wView', label: 'Points for a view (wView)' },
  { name: 'wAffinity', label: 'Extra points for authors this user interacts with (wAffinity)' },
  { name: 'halfLifePost', label: 'How fast posts get old, in hours (halfLifePost)' },
  { name: 'halfLifeReel', label: 'How fast reels get old, in hours (halfLifeReel)' },
  { name: 'halfLifeChannel', label: 'How fast channel posts get old, in hours (halfLifeChannel)' },
  { name: 'halfLifeResearch', label: 'How fast research gets old, in hours (halfLifeResearch)' },
  { name: 'halfLifeQuestion', label: 'How fast questions get old, in hours (halfLifeQuestion)' },
  { name: 'boostMutual', label: 'Boost when they follow each other (boostMutual)' },
  { name: 'boostSelf', label: "Boost for the user's own posts (boostSelf)" },
  { name: 'dampChannel', label: 'Lower channel posts a bit (dampChannel)' },
  { name: 'dampExplore', label: 'Lower explore posts a bit (dampExplore)' },
  { name: 'maxAuthorRun', label: 'Max posts in a row from one author (maxAuthorRun)' },
]

/* Plain labels for the raw settings objects the API returns. Unknown keys stay as they are. */
const KNOB_LABELS = {
  ...Object.fromEntries(KNOB_FIELDS.map((k) => [k.name, k.label])),
  enabled: 'Turned on (enabled)',
  rolloutPercent: 'Share of users, 0–100 (rolloutPercent)',
}
function relabelKnobs(obj) {
  if (!obj) return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[KNOB_LABELS[k] || k] = v
  return out
}

export default function FeedPage() {
  const [tab, setTab] = useState('config')
  return (
    <div>
      <PageIntro
        title="Feed settings"
        lead="Control how the app picks and orders posts in every user's home feed."
        bullets={[
          'You can see the settings the feed uses right now.',
          'You can test new numbers safely first. The test changes nothing.',
          'You can change the numbers for a small share of users first (staged rollout).',
          "You can look at one user's feed and see why each post is there.",
        ]}
      />
      <HowTo steps={[
        'Open "Safe test" and try your new numbers on one real user. This changes nothing.',
        'Happy with the result? Open "Current settings" and click "Change the settings".',
        'Fill in only the numbers you want to change. Start with a small rollout percent, like 5.',
        'Watch how the feed behaves. Raise the percent slowly.',
        'Something wrong? Click "Turn the new settings off". Everyone goes back to the defaults.',
      ]} />
      <Tabs tabs={[
        { id: 'config', label: 'Current settings' },
        { id: 'weights', label: 'Built-in numbers' },
        { id: 'preview', label: 'Safe test (changes nothing)' },
        { id: 'explain', label: "One user's feed" },
      ]} active={tab} onChange={setTab} />
      {tab === 'config' && <Config goPreview={() => setTab('preview')} />}
      {tab === 'weights' && <Weights />}
      {tab === 'preview' && <Preview />}
      {tab === 'explain' && <Explain />}
    </div>
  )
}

function Weights() {
  const { data, err, loading } = useLoad(() => FeedApi.weights(), [])
  return (
    <div className="card">
      <h2>Built-in numbers (compile-time defaults)</h2>
      <Note>These are the numbers built into the code. You cannot change them here. The "Current settings" tab can override them at runtime.</Note>
      <Err e={err} /><Loading on={loading} />
      {data && (
        <>
          <Note>{data.formula} — {data.tuning}</Note>
          <KV obj={relabelKnobs(data)} />
        </>
      )}
    </div>
  )
}

function Config({ goPreview }) {
  const { data, err, loading, reload } = useLoad(() => FeedApi.config(), [])
  const act = useAction()
  const [patchOpen, setPatchOpen] = useState(false)
  const [revertOpen, setRevertOpen] = useState(false)
  const rollout = data?.rollout
  return (
    <div>
      <Warn>Changing these settings changes the feed for every user in the rollout, within 30 seconds. Always run the safe test first.</Warn>
      <Err e={err} />
      <Loading on={loading} />
      {rollout && (
        <Tiles items={[
          { value: rollout.enabled ? 'On' : 'Off', label: 'New settings (override)' },
          { value: `${rollout.rolloutPercent ?? 0}%`, label: 'Share of users who get them (rollout)' },
        ]} />
      )}
      {data && (
        <div className="grid2">
          <div className="card"><h2>Saved changes (override row)</h2>{data.stored ? <KV obj={relabelKnobs(data.stored)} /> : <Note>No saved changes. Everyone is on the built-in defaults.</Note>}</div>
          <div className="card"><h2>Rollout</h2>{rollout && <Badge kind={rollout.enabled ? 'green' : 'gray'}>{rollout.enabled ? 'ON' : 'OFF'}</Badge>}<KV obj={relabelKnobs(rollout)} /></div>
          <div className="card"><h2>Settings for users in the rollout</h2><KV obj={relabelKnobs(data.effectiveWhenInRollout)} /></div>
          <div className="card"><h2>Built-in default settings</h2><KV obj={relabelKnobs(data.defaults)} /></div>
        </div>
      )}
      <div className="row">
        <button className="secondary" onClick={goPreview}>Test new numbers first (safe test)</button>
        <button title="PATCH /api/v1/admin/feed/config" onClick={() => setPatchOpen(true)}>Change the settings… (extra password check)</button>
        {data?.stored?.enabled && (
          <button className="secondary" title="PATCH /api/v1/admin/feed/config" onClick={() => setRevertOpen(true)}>Turn the new settings off</button>
        )}
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      {patchOpen && (
        <FormModal title="Change the feed settings" danger wide requireText="CHANGE"
          intro="Fill in only the numbers you want to change. Blank fields keep their default. Rollout percent must be 0–100. Numbers must be 0–1000. Max posts in a row must be 1–10. This changes real feeds for users in the rollout."
          fields={[
            { name: 'enabled', label: 'Use the new settings (enabled)', type: 'checkbox', value: data?.stored?.enabled ?? true },
            { name: 'rolloutPercent', label: 'Share of users, 0–100 (rolloutPercent)', type: 'number', value: data?.stored?.rolloutPercent ?? '', help: 'Only this percent of users gets the new settings. Start small, like 5.' },
            ...KNOB_FIELDS.map((k) => ({ name: k.name, label: k.label, type: 'number' })),
          ]}
          submitLabel="Save changes (extra password check)"
          onSubmit={async (v) => {
            const body = {}
            for (const [k, val] of Object.entries(v)) if (val !== undefined) body[k] = val
            await FeedApi.patchConfig(body)
            act.setOk('Saved. The feed uses the new settings within 30 seconds.')
            reload()
          }}
          onClose={() => setPatchOpen(false)} />
      )}
      {revertOpen && (
        <Confirm
          title="Turn the new settings off"
          message="This turns the override off. Everyone goes back to the built-in default settings. Your saved numbers stay, so you can turn them on again later."
          confirmLabel="Turn them off"
          busy={act.busy}
          onConfirm={async () => {
            const r = await act.run(() => FeedApi.patchConfig({ enabled: false }), 'The new settings are off. Everyone is back on the defaults.')
            if (r !== undefined) { setRevertOpen(false); reload() }
          }}
          onClose={() => setRevertOpen(false)}
        />
      )}
    </div>
  )
}

function Preview() {
  const act = useAction()
  const [userId, setUserId] = useState('')
  const [overrides, setOverrides] = useState('')
  const [result, setResult] = useState(null)
  return (
    <div className="card">
      <Note>This test scores one real user's next feed page with your new numbers. It changes nothing and saves nothing. Your numbers are tried on top of the built-in defaults, not on top of saved changes. Leave the box empty to run the test with no changed numbers.</Note>
      <div className="filters">
        <Field label="User id *"><input value={userId} onChange={(e) => setUserId(e.target.value)} className="w-id" /></Field>
        <Field label="Numbers to try (JSON)"><input value={overrides} onChange={(e) => setOverrides(e.target.value)} className="w-id" placeholder='{"wShare": 8.0, "dampExplore": 0.5}' /></Field>
        <button disabled={!userId || act.busy} title="POST /api/v1/admin/feed/preview" onClick={async () => {
          let ov
          if (overrides.trim()) { try { ov = JSON.parse(overrides) } catch (e) { act.setErr({ message: `The JSON in "Numbers to try" is not valid: ${e.message}` }); return } }
          const r = await act.run(() => FeedApi.preview({ userId, limit: 20, overrides: ov }), 'Test done. Nothing was changed or saved.')
          if (r) setResult(r)
        }}>Run the safe test</button>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      {result && (
        <>
          {result.note && <Note>{result.note}</Note>}
          <DataTable
            columns={[
              { key: 'rank', label: 'New place' },
              { key: 'baselineRank', label: 'Old place', render: (r) => r.baselineRank ?? <em className="muted">new</em> },
              { key: 'rankDelta', label: 'Moved', render: (r) => r.rankDelta != null ? (r.rankDelta > 0 ? <span className="num-ok">{r.rankDelta} up</span> : r.rankDelta < 0 ? <span className="num-bad">{-r.rankDelta} down</span> : <span className="muted">—</span>) : null },
              { key: 'entityType', label: 'Kind of content' },
              { key: 'source', label: 'Where it came from' },
              { key: 'score', label: 'Score' },
              { key: 'id', label: 'Item id', render: (r) => <Id v={r.id} /> },
            ]}
            rows={result.preview || []}
            empty="This user's next page has no items to score."
          />
          <div className="grid2">
            <div><h3>Numbers this user gets now</h3><KV obj={relabelKnobs(result.baselineKnobs)} /></div>
            <div><h3>Numbers you tried</h3><KV obj={relabelKnobs(result.proposedKnobs)} /></div>
          </div>
        </>
      )}
    </div>
  )
}

function Explain() {
  const act = useAction()
  const [userId, setUserId] = useState('')
  const [explain, setExplain] = useState(null)
  const [affinity, setAffinity] = useState(null)
  return (
    <div className="card">
      <Note>This shows the exact posts the app would give this user right now, and why. It also shows which authors this user interacts with the most. Both lookups are written to the action history (audited), because this is personal behavior data.</Note>
      <div className="filters">
        <Field label="User id *"><input value={userId} onChange={(e) => setUserId(e.target.value)} className="w-id" /></Field>
        <button disabled={!userId || act.busy} title="GET /api/v1/admin/feed/explain/{userId} + /affinity/{userId}" onClick={async () => {
          const [e, a] = await Promise.all([
            act.run(() => FeedApi.explain(userId, 20)),
            act.run(() => FeedApi.affinity(userId, 50)),
          ])
          if (e) setExplain(e); if (a) setAffinity(a)
        }}>Show this user's feed</button>
      </div>
      <Err e={act.err} />
      {explain && (
        <>
          <h3>Next feed page ({explain.items?.length ?? 0} items)</h3>
          <DataTable
            columns={[
              { key: 'rankScore', label: 'Score' },
              { key: 'entityType', label: 'Kind of content' },
              { key: 'postType', label: 'Post type' },
              { key: 'source', label: 'Where it came from' },
              { key: 'authorId', label: 'Author', render: (r) => <Id v={r.authorId} /> },
              { key: 'createdAt', label: 'When it was made' },
            ]}
            rows={explain.items || []}
            empty="This user's feed page is empty right now."
          />
        </>
      )}
      {affinity && (
        <>
          <h3>Authors this user interacts with (top {affinity.length})</h3>
          <DataTable
            columns={[
              { key: 'authorId', label: 'Author', render: (r) => <code>{r.authorId}</code> },
              { key: 'interactions', label: 'Number of interactions' },
            ]}
            rows={affinity}
            empty="No interaction data for this user yet."
          />
        </>
      )}
    </div>
  )
}
