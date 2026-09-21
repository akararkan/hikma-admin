import React, { useState } from 'react'
import { ContentApi, AuditApi } from '../../api'
import { useAction } from '../../util'
import { DataTable, Err, Ok, Note, Warn, Field, Select, StatusBadge, JsonBlock, Modal, CursorPager, PageIntro, HowTo } from '../../components/ui'
import FormModal from '../../components/FormModal'

const POST_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'REMOVED']

export default function ContentPage() {
  return (
    <div>
      <PageIntro
        title="Find & remove content"
        lead="Find a user's posts, then remove them from the app or put them back."
        bullets={[
          'You can list all posts by one user.',
          'You can look up one post by its id.',
          'You can remove a post from the app — and put it back later.',
          'You can delete a comment or a story forever.',
          'You can unpin a story from a highlight without deleting it.',
        ]}
      />
      <HowTo steps={[
        'Get the user’s id first. Find it on the All users page, or copy it from a report.',
        'Paste the id in the "User id" box and click "Show their posts".',
        'Click "Look" to read a post. Click "Remove this post" to hide it from the app.',
        'Removed the wrong post? Click "Put it back". Removing a post is not final.',
        'Deleting a comment or a story is final. You cannot undo it. Read the warning before you confirm.',
      ]} />
      <PostLookup />
      <PostsBrowser />
      <ActById />
    </div>
  )
}

function PostLookup() {
  const act = useAction()
  const [postId, setPostId] = useState('')
  const [detail, setDetail] = useState(null)
  return (
    <div className="card">
      <h2>Look up one post by id</h2>
      <div className="row">
        <input className="w-id" value={postId} onChange={(e) => setPostId(e.target.value)} placeholder="post id (UUID)" />
        <button title="GET /api/v1/admin/content/posts/{postId}" disabled={!postId || act.busy}
          onClick={async () => { const d = await act.run(() => ContentApi.post(postId.trim()), 'Post found.'); if (d) setDetail(d) }}>Find this post</button>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      {detail && (
        <Modal title={<>Post <code>{detail.id}</code></>} onClose={() => setDetail(null)} wide>
          <JsonBlock v={detail} />
        </Modal>
      )}
    </div>
  )
}

function PostsBrowser() {
  const act = useAction()
  const [authorId, setAuthorId] = useState('')
  const [status, setStatus] = useState(undefined)
  const [rows, setRows] = useState(null)
  const [lastBatch, setLastBatch] = useState(null)
  const [detail, setDetail] = useState(null)
  const [modal, setModal] = useState(null) // {kind:'remove', id}
  const [trail, setTrail] = useState(null)

  const load = async (cursor) => {
    const res = await act.run(() => ContentApi.posts({ authorId, status, cursor, pageSize: 20 }))
    if (res) { setLastBatch(res.length); setRows(cursor ? [...(rows || []), ...res] : res) }
  }

  return (
    <div className="card">
      <h2>One user's posts</h2>
      <Note>There is no list of all posts. Posts are stored per user, so you must give a user id first.</Note>
      <div className="filters">
        <Field label="User id (author) *"><input className="w-id" value={authorId} onChange={(e) => setAuthorId(e.target.value)} placeholder="UUID — from All users or a report" /></Field>
        <Field label="Status"><Select value={status} onChange={setStatus} options={POST_STATUSES} /></Field>
        <button title="GET /api/v1/admin/content/posts" disabled={!authorId || act.busy} onClick={() => load()}>Show their posts</button>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      {rows && (
        <>
          <DataTable
            columns={[
              { key: 'createdAt', label: 'When' },
              { key: 'postType', label: 'Type' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
              { key: 'visibility', label: 'Who can see it' },
              { key: 'textContent', label: 'Text', render: (r) => <span>{(r.textContent || '').slice(0, 80)}</span> },
              { key: 'counters', label: 'Counts', render: (r) => r.counters ? `likes ${r.counters.reactions ?? 0} · comments ${r.counters.comments ?? 0} · views ${r.counters.views ?? 0}` : '—' },
              {
                key: '_', label: '', render: (r) => (
                  <span className="row-actions">
                    <button className="small secondary" title="GET /api/v1/admin/content/posts/{postId}" onClick={async (e) => { e.stopPropagation(); const d = await act.run(() => ContentApi.post(r.id)); if (d) setDetail(d) }}>Look</button>
                    {r.status === 'REMOVED'
                      ? <button className="small" title="POST /api/v1/admin/content/posts/{postId}/restore" onClick={async (e) => { e.stopPropagation(); await act.run(() => ContentApi.restorePost(r.id), 'The post is back for everyone (PUBLISHED).'); load() }}>Put it back</button>
                      : <button className="small danger" onClick={(e) => { e.stopPropagation(); setModal({ kind: 'remove', id: r.id }) }}>Remove this post</button>}
                    <button className="small secondary" title="GET /api/v1/admin/audit/resources/Post/{id}" onClick={async (e) => { e.stopPropagation(); const t = await act.run(() => AuditApi.byResource('Post', r.id, { pageSize: 30 })); if (t) setTrail({ id: r.id, rows: t }) }}>History</button>
                  </span>
                )
              },
            ]}
            rows={rows}
            loading={act.busy}
            empty="No posts found for this user and status."
          />
          <CursorPager rows={rows} lastBatch={lastBatch} onMore={(c) => load(c)} />
        </>
      )}
      {detail && (
        <Modal title={<>Post <code>{detail.id}</code></>} onClose={() => setDetail(null)} wide>
          <JsonBlock v={detail} />
        </Modal>
      )}
      {trail && (
        <Modal title={<>Action history — post <code>{trail.id}</code></>} onClose={() => setTrail(null)} wide>
          <Note>Every admin action on this post, newest first.</Note>
          <DataTable
            columns={[
              { key: 'createdAt', label: 'When' }, { key: 'username', label: 'Who' },
              { key: 'operation', label: 'What they did' }, { key: 'path', label: 'Request (for engineers)', render: (r) => <code>{r.path}</code> },
              { key: 'statusCode', label: 'Result code' }, { key: 'summary', label: 'Summary' },
            ]}
            rows={trail.rows}
            empty="No admin actions on this post yet."
          />
        </Modal>
      )}
      {modal?.kind === 'remove' && (
        <FormModal
          title="Remove this post" danger
          intro="This hides the post from everyone in the app. It is not final — you can put it back later, and likes and comments are kept. The author gets a message with your reason. You will be asked for your password again (step-up)."
          fields={[
            { name: 'reason', label: 'Why are you removing it? (the author will see this; max 500 letters)', type: 'textarea' },
            { name: 'reportId', label: 'Report id (optional — links this action to a report)' },
          ]}
          submitLabel="Remove this post"
          onSubmit={async (v) => { await ContentApi.removePost(modal.id, v); act.setOk('The post is removed. You can put it back later if needed.'); load() }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function ActById() {
  const act = useAction()
  const [modal, setModal] = useState(null)
  return (
    <div className="card">
      <h2>Delete forever (cannot be undone)</h2>
      <Warn>
        Deleting a comment also deletes every reply under it. Deleting a story also removes it
        from every highlight. A copy is saved for our records first (evidence snapshot), but the
        content itself is gone for good. If you only need to hide a story from a highlight,
        use "Unpin" instead — it does not delete anything.
      </Warn>
      <div className="row">
        <button className="danger" onClick={() => setModal('comment')}>Delete a comment…</button>
        <button className="danger" onClick={() => setModal('story')}>Delete a story…</button>
        <button className="secondary" onClick={() => setModal('highlight')}>Unpin a story from a highlight…</button>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      {modal === 'comment' && (
        <FormModal title="Delete a comment — this cannot be undone" danger requireText="DELETE"
          intro="This deletes the comment AND all replies under it, for everyone. You cannot undo it. A copy is saved for our records first. You will be asked for your password again (step-up)."
          fields={[
            { name: 'commentId', label: 'Comment id *', required: true },
            { name: 'reason', label: 'Why? (kept in the records)', type: 'textarea' },
            { name: 'reportId', label: 'Report id (optional)' },
          ]}
          submitLabel="Delete this comment forever"
          onSubmit={async (v) => { await ContentApi.deleteComment(v.commentId, { reason: v.reason, reportId: v.reportId }); act.setOk('The comment and its replies are deleted. A copy was saved for our records.') }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'story' && (
        <FormModal title="Delete a story — this cannot be undone" danger requireText="DELETE"
          intro="This deletes the story, its poll, and every highlight pin of it, for everyone. You cannot undo it. A copy is saved for our records first. You will be asked for your password again (step-up)."
          fields={[
            { name: 'storyId', label: 'Story id *', required: true },
            { name: 'reason', label: 'Why? (kept in the records)', type: 'textarea' },
            { name: 'reportId', label: 'Report id (optional)' },
          ]}
          submitLabel="Delete this story forever"
          onSubmit={async (v) => { await ContentApi.deleteStory(v.storyId, { reason: v.reason, reportId: v.reportId }); act.setOk('The story is deleted, everywhere it was pinned. A copy was saved for our records.') }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'highlight' && (
        <FormModal title="Unpin a story from a highlight"
          intro="This only removes the pin from one highlight. The story itself is not touched."
          fields={[
            { name: 'highlightId', label: 'Highlight id *', required: true },
            { name: 'storyId', label: 'Story id *', required: true },
            { name: 'reason', label: 'Why? (kept in the records)', type: 'textarea' },
          ]}
          submitLabel="Unpin the story"
          onSubmit={async (v) => { await ContentApi.unpinHighlight(v.highlightId, v.storyId, { reason: v.reason }); act.setOk('Done. The story is off that highlight, but the story still exists.') }}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}
