import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ModerationApi, ContentApi } from '../../api'
import { useLoad, useAction } from '../../util'
import { DataTable, Err, Ok, Note, Warn, Field, Select, Badge, StatusBadge, PageIntro, HowTo, JsonBlock, Modal, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'

const TARGET_TYPES = ['USER', 'POST', 'COMMENT', 'RESEARCH', 'QUESTION', 'ANSWER', 'MESSAGE', 'CHANNEL', 'STORY']
const BULK_ACTIONS = [
  { value: 'TAKEDOWN', label: 'TAKEDOWN — remove posts from the app' },
  { value: 'RESTORE', label: 'RESTORE — put removed posts back' },
  { value: 'DELETE', label: 'DELETE — delete comments/stories forever' },
  { value: 'SOUND_APPROVE', label: 'SOUND_APPROVE — approve sounds' },
  { value: 'SOUND_REJECT', label: 'SOUND_REJECT — reject sounds' },
]
const BULK_TARGET_TYPES = ['POST', 'COMMENT', 'STORY', 'SOUND']
const SOURCES = [
  { value: 'reports', label: 'User reports' },
  { value: 'media', label: 'Photo/video checks' },
  { value: 'keywords', label: 'Blocked words' },
]
const SOURCE_LABELS = { reports: 'User report', media: 'Photo/video check', keywords: 'Blocked word' }

export default function QueuePage() {
  const [source, setSource] = useState(undefined)
  const [targetType, setTargetType] = useState(undefined)
  const [page, setPage] = useState(0)
  const { data, err, loading, reload } = useLoad(() => ModerationApi.queue({ source, targetType, page, pageSize: 50 }), [source, targetType, page])
  const act = useAction()
  const [hitId, setHitId] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkResults, setBulkResults] = useState(null)
  const [inspect, setInspect] = useState(null)   // full post row from ContentApi.post
  const [removeId, setRemoveId] = useState(null) // post id being removed

  return (
    <div>
      <PageIntro
        title="Reported content"
        lead="One list of live content that may break the rules."
        bullets={[
          'You can see reports from users about posts, comments, and stories.',
          'You can see photos and videos that failed the safety scan.',
          'You can see posts that used a blocked word.',
          'You can open a post to read it before you act.',
          'You can act on up to 100 items at once.',
        ]}
      />
      <HowTo steps={[
        'Use the "Where is it from?" filter to see one kind of item, or leave it empty to see all.',
        'For a post, click "Look" to read it. Then remove it, or leave it alone.',
        'To remove, restore, or delete other content, use the Find & remove content page.',
        'To act on many items at once, click "Act on many items…". Read the result for each item after.',
        'When a blocked-word item is handled, mark it done with its hit id (bottom of the page).',
      ]} />
      <Warn>
        Everything here is <strong>already live</strong> — other users can see it.
        New posts that the AI is holding back are on a different page:{' '}
        <Link to="/moderation/review">New posts to check (AI)</Link>. Do not mix them up.
      </Warn>
      <Note>
        The list has three parts and no single order: user reports show oldest first,
        photo/video items newest first, blocked-word hits oldest first.
      </Note>
      <div className="filters">
        <Field label="Where is it from?"><Select value={source} onChange={(v) => { setSource(v); setPage(0) }} options={SOURCES} emptyLabel="(all three)" /></Field>
        <Field label="What kind of thing? (user reports only)"><Select value={targetType} onChange={(v) => { setTargetType(v); setPage(0) }} options={TARGET_TYPES} /></Field>
        <Field label="Page number (starts at 0)"><input type="number" min={0} value={page} onChange={(e) => setPage(Number(e.target.value) || 0)} /></Field>
        <button className="secondary" onClick={reload}>Refresh the list</button>
        <button title="POST /api/v1/admin/moderation/bulk" onClick={() => { setBulkResults(null); setBulkOpen(true) }}>Act on many items…</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'source', label: 'Where from', render: (r) => <Badge kind={r.source === 'reports' ? 'red' : r.source === 'media' ? 'blue' : 'gray'}>{SOURCE_LABELS[r.source] || r.source}</Badge> },
          { key: 'targetType', label: 'What kind' },
          { key: 'targetRef', label: 'Item id', render: (r) => <Id v={r.targetRef} /> },
          { key: 'reason', label: 'Why it is here' },
          { key: 'reportCount', label: 'How many reports' },
          { key: 'state', label: 'Status', render: (r) => <StatusBadge value={r.state} /> },
          { key: 'firstSeen', label: 'First seen' },
          { key: 'lastSeen', label: 'Last seen' },
          {
            key: '_', label: '', render: (r) => (
              r.targetType === 'POST'
                ? <button className="small secondary" title="GET /api/v1/admin/content/posts/{postId}" disabled={act.busy}
                    onClick={async () => { const p = await act.run(() => ContentApi.post(r.targetRef), 'Post loaded.'); if (p) setInspect(p) }}>Look</button>
                : null
            )
          },
        ]}
        rows={data || []}
        loading={loading}
        empty="The list is empty. No reports are waiting. Nothing to do here right now."
      />

      <div className="card">
        <h2>Mark a blocked-word hit as done</h2>
        <Note>
          Blocked-word rows do not show their own hit id. Ask an engineer for the id
          (from the platform_keyword_hits table), paste it here, then click the button.
          A wrong id does nothing — you will not see an error.
        </Note>
        <div className="row">
          <input className="w-id" value={hitId} onChange={(e) => setHitId(e.target.value)} placeholder="hit id (UUID)" />
          <button title="POST /api/v1/admin/moderation/queue/keywords/{hitId}/resolve" disabled={!hitId || act.busy}
            onClick={async () => { await act.run(() => ModerationApi.resolveKeywordHit(hitId), 'Done. The hit is off the list.'); setHitId(''); reload() }}>Mark it done</button>
        </div>
      </div>

      {bulkResults && (
        <div className="card">
          <h2>Result for each item</h2>
          <Note>Check every row. Some items can fail while others succeed. Fix and retry only the failed ones.</Note>
          <DataTable
            columns={[
              { key: 'type', label: 'Type' }, { key: 'id', label: 'Item id', render: (r) => <Id v={r.id} /> },
              { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome === 'ok' ? 'SUCCESS' : 'FAILED'} /> },
              { key: 'error', label: 'What went wrong' },
            ]}
            rows={bulkResults}
          />
        </div>
      )}
      {bulkOpen && (
        <FormModal
          title="Act on many items at once (up to 100)" danger requireText="BULK"
          intro="Pick one action, then list the items — one per line, as TYPE:id or just the id. TAKEDOWN and RESTORE work on posts. DELETE works on comments and stories, and it cannot be undone. SOUND_APPROVE and SOUND_REJECT work on sounds. You will be asked for your password again (step-up)."
          fields={[
            { name: 'action', label: 'What to do *', type: 'select', options: BULK_ACTIONS, required: true },
            { name: 'defaultType', label: 'If a line has no type, treat it as', type: 'select', options: BULK_TARGET_TYPES, value: 'POST' },
            { name: 'targets', label: 'Items * (one per line: TYPE:id or just the id)', type: 'textarea', required: true },
            { name: 'reason', label: 'Why? (max 500 letters; for SOUND_REJECT this is also the reject reason code)', type: 'textarea' },
          ]}
          submitLabel="Run it on all items"
          onSubmit={async (v) => {
            const targets = String(v.targets).split(/\n+/).map((s) => s.trim()).filter(Boolean).map((line) => {
              const m = /^([A-Za-z_]+)\s*[:,]\s*(.+)$/.exec(line)
              return m ? { type: m[1].toUpperCase(), id: m[2].trim() } : { type: v.defaultType || 'POST', id: line }
            })
            const res = await ModerationApi.bulk({ action: v.action, targets, reason: v.reason })
            setBulkResults(res); reload()
          }}
          onClose={() => setBulkOpen(false)}
        />
      )}

      {inspect && (
        <Modal title={<>Post <code>{inspect.id}</code></>} onClose={() => setInspect(null)} wide>
          <div className="toolbar">
            <span>Status: <StatusBadge value={inspect.status} /></span>
            {inspect.status === 'REMOVED'
              ? <button className="small" title="POST /api/v1/admin/content/posts/{postId}/restore" disabled={act.busy}
                  onClick={async () => { await act.run(() => ContentApi.restorePost(inspect.id), 'The post is back for everyone (PUBLISHED).'); setInspect(null); reload() }}>Put this post back</button>
              : <button className="small danger" onClick={() => { setRemoveId(inspect.id); setInspect(null) }}>Remove this post…</button>}
          </div>
          <JsonBlock v={inspect} />
        </Modal>
      )}
      {removeId && (
        <FormModal
          title="Remove this post" danger
          intro="This hides the post from everyone in the app. It is not final — you can put it back later, and likes and comments are kept. The author gets a message with your reason. You will be asked for your password again (step-up)."
          fields={[
            { name: 'reason', label: 'Why are you removing it? (the author will see this; max 500 letters)', type: 'textarea' },
            { name: 'reportId', label: 'Report id (optional — links this action to a report)' },
          ]}
          submitLabel="Remove this post"
          onSubmit={async (v) => { await ContentApi.removePost(removeId, v); act.setOk('The post is removed. You can put it back later if needed.'); reload() }}
          onClose={() => setRemoveId(null)}
        />
      )}
    </div>
  )
}
