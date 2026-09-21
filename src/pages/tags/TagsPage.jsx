import React, { useState } from 'react'
import { TrendingApi, TagsApi } from '../../api'
import { useLoad, useAction } from '../../util'
import { DataTable, Err, Ok, Note, Warn, Field, Select, Badge, KV, PageIntro, HowTo } from '../../components/ui'
import FormModal from '../../components/FormModal'

const SCOPES = [
  { value: 'ALL', label: 'Everywhere (ALL)' },
  { value: 'QUESTION', label: 'Questions (QUESTION)' },
  { value: 'RESEARCH', label: 'Research papers (RESEARCH)' },
  { value: 'POST', label: 'Posts (POST)' },
  { value: 'REEL', label: 'Reels (REEL)' },
]

export default function TagsPage() {
  return (
    <div>
      <PageIntro
        title="Tags & trending"
        lead="Manage hashtags and the trending list users see."
        bullets={[
          'You can pin a tag to the top of trending, or ban it from trending.',
          'You can hide a tag from trending and show it again later.',
          'You can join two spellings of the same tag into one (merge).',
          'You can rebuild the trending list right away.',
          'You can run the one-time repair that adds old posts to the tag lists (backfill).',
        ]}
      />
      <HowTo steps={[
        'The trending list rebuilds itself about every 10 minutes. Pins, bans, and hides start working then.',
        'To make a change show right away, click "Rebuild the list now".',
        'To spotlight or block a tag, use "Pin or ban a tag" in the first box.',
        'To fix a misspelled tag, use "Join two tags". Run it again if it says "not finished".',
        'Leave the backfill alone unless an engineer asks for it. Running it twice breaks the trending numbers.',
      ]} />
      <Overrides />
      <TagTools />
      <Backfill />
    </div>
  )
}

function Overrides() {
  const [activeOnly, setActiveOnly] = useState('true')
  const { data, err, loading, reload } = useLoad(() => TrendingApi.overrides(activeOnly), [activeOnly])
  const act = useAction()
  const [createOpen, setCreateOpen] = useState(false)
  return (
    <div className="card">
      <h2>Pinned & banned tags (trending overrides)</h2>
      <Note>A pin puts a tag at a fixed place in trending. A ban keeps it out. Both change what every user sees, so write a reason and set an end date when you can.</Note>
      <div className="filters">
        <Field label="Show"><Select value={activeOnly} onChange={(v) => setActiveOnly(v || 'true')} options={[
          { value: 'true', label: 'Current ones' },
          { value: 'false', label: 'All, even cancelled ones' },
        ]} allowEmpty={false} /></Field>
        <button title="POST /api/v1/admin/trending/overrides" onClick={() => setCreateOpen(true)}>+ Pin or ban a tag</button>
        <button className="secondary" title="POST /api/v1/admin/trending/rebuild" disabled={act.busy} onClick={() => act.run(() => TrendingApi.rebuild(), 'The trending list was rebuilt. Your changes show now.')}>Rebuild the list now</button>
        <button className="secondary" onClick={reload}>Refresh the list</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'tagNormalized', label: 'Tag', render: (r) => <code>#{r.tagNormalized}</code> },
          { key: 'scope', label: 'Where' },
          { key: 'type', label: 'Pin or ban', render: (r) => <Badge kind={r.type === 'BAN' ? 'err' : 'green'}>{r.type}</Badge> },
          { key: 'pinnedRank', label: 'Pin place' },
          { key: 'reason', label: 'Why' },
          { key: 'expiresAt', label: 'Ends on' },
          { key: 'active', label: 'Working now' },
          { key: '_', label: '', render: (r) => <button className="small danger" title="DELETE /api/v1/admin/trending/overrides/{id}" onClick={async () => { await act.run(() => TrendingApi.deleteOverride(r.id), 'Cancelled. It stops at the next rebuild.'); reload() }}>Cancel it</button> },
        ]}
        rows={data || []}
        loading={loading}
        empty="No pins or bans yet. Nothing changes trending right now."
      />
      {createOpen && (
        <FormModal title="Pin or ban a tag" danger
          intro="This changes the trending list every user sees. You will be asked for your password again (step-up)."
          fields={[
            { name: 'tag', label: 'Tag * (the # sign is removed for you)', required: true },
            { name: 'type', label: 'What do you want? *', type: 'select', options: [
              { value: 'PIN', label: 'Pin it near the top (PIN)' },
              { value: 'BAN', label: 'Ban it from trending (BAN)' },
            ], required: true },
            { name: 'scope', label: 'Where', type: 'select', options: SCOPES, value: 'ALL' },
            { name: 'rank', label: 'Pin place (only for PIN, 1 = top)', type: 'number' },
            { name: 'expiresAt', label: 'End date and time', placeholder: '2026-09-01T00:00:00', help: 'Leave empty to keep it until you cancel it.' },
            { name: 'reason', label: 'Why? (up to 500 letters)', type: 'textarea' },
          ]}
          submitLabel="Save"
          onSubmit={async (v) => { await TrendingApi.createOverride(v); act.setOk('Saved. It starts at the next rebuild — or click "Rebuild the list now".'); reload() }}
          onClose={() => setCreateOpen(false)} />
      )}
    </div>
  )
}

function TagTools() {
  // Each card gets its own action state, so its banner shows under its own buttons.
  const hideAct = useAction()
  const mergeAct = useAction()
  const [hide, setHide] = useState({ tag: '', scope: 'ALL' })
  const [merge, setMerge] = useState({ from: '', to: '' })
  const [mergeResult, setMergeResult] = useState(null)
  return (
    <div className="grid2">
      <div className="card">
        <h2>Hide a tag from trending</h2>
        <Note>Hide adds a ban for the tag. It starts at the next rebuild. To show the tag again, pick the same "Where" you used to hide it. A tag hidden "Everywhere" must be shown again with "Everywhere".</Note>
        <div className="filters">
          <Field label="Tag"><input value={hide.tag} onChange={(e) => setHide((s) => ({ ...s, tag: e.target.value }))} placeholder="#hashtag" /></Field>
          <Field label="Where"><Select value={hide.scope} onChange={(v) => setHide((s) => ({ ...s, scope: v || 'ALL' }))} options={SCOPES} allowEmpty={false} /></Field>
          <button title="POST /api/v1/admin/tags/{tag}/hide" disabled={!hide.tag || hideAct.busy} onClick={() => hideAct.run(() => TagsApi.hide(hide.tag, hide.scope), `#${hide.tag} is hidden. It leaves trending at the next rebuild.`)}>Hide this tag</button>
          <button className="secondary" title="DELETE /api/v1/admin/tags/{tag}/hide" disabled={!hide.tag || hideAct.busy} onClick={() => hideAct.run(() => TagsApi.unhide(hide.tag, hide.scope), `#${hide.tag} can trend again.`)}>Show it again</button>
        </div>
        <Err e={hideAct.err} /><Ok msg={hideAct.ok} />
      </div>
      <div className="card">
        <h2>Join two tags (merge)</h2>
        <Note>This moves all content from the wrong tag to the right one. It moves at most 5,000 rows each run. If the result says "not finished", run the same merge again. You will be asked for your password again (step-up).</Note>
        <div className="filters">
          <Field label="Wrong spelling (from)"><input value={merge.from} onChange={(e) => setMerge((s) => ({ ...s, from: e.target.value }))} placeholder="hadeeth" /></Field>
          <Field label="Right spelling (to)"><input value={merge.to} onChange={(e) => setMerge((s) => ({ ...s, to: e.target.value }))} placeholder="hadith" /></Field>
          <button title="POST /api/v1/admin/tags/merge" disabled={!merge.from || !merge.to || mergeAct.busy} onClick={async () => {
            const r = await mergeAct.run(() => TagsApi.merge(merge.from, merge.to), 'The merge ran.')
            if (r) setMergeResult(r)
          }}>Join these tags</button>
        </div>
        <Err e={mergeAct.err} /><Ok msg={mergeAct.ok} />
        {mergeResult && (
          <>
            <KV obj={{
              'From tag': mergeResult.from,
              'To tag': mergeResult.to,
              'Rows moved': mergeResult.rowsMoved,
              'Finished': !mergeResult.truncated,
            }} />
            {mergeResult.truncated && <Warn>Not finished. The 5,000-row limit was hit. Run the same merge again to move the rest.</Warn>}
          </>
        )}
      </div>
    </div>
  )
}

function Backfill() {
  const act = useAction()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState(null)
  return (
    <div className="card">
      <h2>One-time repair: add old posts to the tag lists (backfill)</h2>
      <Warn>Danger: run this only once, and only when an engineer asks for it. It reads every post on the platform. Running it twice makes the trending numbers wrong, and you cannot fix them after.</Warn>
      <button className="danger" title="POST /api/v1/admin/tags/backfill-posts" onClick={() => setOpen(true)}>Run the repair…</button>
      <Err e={act.err} /><Ok msg={act.ok} />
      {result && (
        <KV obj={{
          'Posts read': result.postsScanned,
          'Posts with hashtags': result.postsWithHashtags,
          'Tag rows written': result.tagRowsWritten,
          'Finished at': result.startedAt,
        }} />
      )}
      {open && (
        <FormModal title="Run the one-time repair" danger requireText="BACKFILL"
          intro="This scans every post and can take a long time. It is safe to run ONCE. A second run makes the trending numbers wrong forever. You will be asked for your password again (step-up)."
          fields={[]}
          submitLabel="Run it now"
          onSubmit={async () => {
            const r = await TagsApi.backfillPosts()
            setResult(r); act.setOk('The repair finished. The numbers are below.')
          }}
          onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
