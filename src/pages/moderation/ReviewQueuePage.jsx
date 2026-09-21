import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AutoModApi, mediaUrl } from '../../api'
import { useLoad, useAction, fmtNum, short } from '../../util'
import { DataTable, Pager, Tiles, Err, Ok, Note, Warn, Field, Select, Badge, StatusBadge, PageIntro, HowTo, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'
import { QUEUE_ENTITY_TYPES, isRedacted, isImageCase, fmtScore, ReasonBadge, Countdown } from '../../components/moderation'
import { useAuth } from '../../auth/AuthContext'

const BULK_CAP = 100
const DECIDERS = ['ADMIN', 'MODERATOR']

/** Plain names for the wire enums. The values sent to the server never change. */
const TYPE_LABELS = {
  post: 'Post',
  post_comment: 'Comment on a post',
  story: 'Story',
  story_poll: 'Story poll',
  research: 'Research paper',
  research_comment: 'Comment on research',
  qna_question: 'Question (Q&A)',
  qna_answer: 'Answer (Q&A)',
  chat_message: 'Private chat message',
  channel: 'Channel',
  stream_meta: 'Live stream info',
  live_chat: 'Live stream chat (private)',
  content_annotation: 'Note on content',
  media_image: 'Image (uploaded picture)',
}
const TYPE_OPTIONS = QUEUE_ENTITY_TYPES.map((v) => ({ value: v, label: TYPE_LABELS[v] || v }))

const STATUS_OPTIONS = [
  { value: 'IN_REVIEW', label: 'Waiting for a person (IN_REVIEW)' },
  { value: 'PENDING', label: 'AI still working (PENDING)' },
  { value: 'APPROVED', label: 'Approved — went live (APPROVED)' },
  { value: 'REJECTED', label: 'Rejected — stayed hidden (REJECTED)' },
]

const TEACH_HELP = 'Tick this only when the AI was clearly wrong about the words themselves. '
  + 'Do not tick it when you decided because of other things — the author\'s history, or the situation. '
  + 'The AI only ever sees the text, so it would learn the wrong lesson.'

const SORT_HELP = '"Riskiest first" shows the posts the AI was least sure about. "Oldest first" helps you clear a backlog.'

const num = (n) => (n == null ? undefined : fmtNum(n))

// FormModal has no maxLength, so catch the server's 500-char cap here.
function assertReason(reason) {
  const n = String(reason ?? '').length
  if (n > 500) throw new Error(`Your reason is ${n} letters long. The limit is 500.`)
}

export default function ReviewQueuePage() {
  const nav = useNavigate()
  const { user } = useAuth()
  const canDecide = DECIDERS.includes(user?.role)
  const gate = canDecide ? undefined : `You need the ADMIN or MODERATOR role to decide. Your role is ${user?.role || 'unknown'}.`

  const [f, setF] = useState({ status: 'IN_REVIEW', entityType: undefined, slaBreached: undefined, sort: 'risk', pageSize: 50 })
  const [page, setPage] = useState(0)
  const [sel, setSel] = useState([])
  const [openId, setOpenId] = useState('')
  const [decide, setDecide] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkResults, setBulkResults] = useState(null)
  const [resp, setResp] = useState(null)

  const { data, err, loading, reload } = useLoad(() => AutoModApi.review({ ...f, page }), [JSON.stringify(f), page])
  const act = useAction()

  const rows = data?.items || []
  const counts = data?.counts
  // Selection is page-local — a caseId scrolled out of view is a case the moderator cannot spot-check.
  const set = (k, v) => { setPage(0); setSel([]); setF((s) => ({ ...s, [k]: v })) }
  const goPage = (p) => { setSel([]); setPage(p) }
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const pageIds = rows.map((r) => r.caseId)
  const allOn = pageIds.length > 0 && pageIds.every((id) => sel.includes(id))
  const overCap = sel.length > BULK_CAP
  const redactedSel = rows.filter((r) => sel.includes(r.caseId) && isRedacted(r.entityType)).length

  const openDecide = (row, action) => { act.clear(); setResp(null); setBulkResults(null); setDecide({ row, action }) }

  const rescore = async (row) => {
    const r = await act.run(() => AutoModApi.rescore(row.caseId), 'The AI scored it again with the live model.')
    setResp(r || null)
    reload()
  }

  const decideRedacted = decide ? isRedacted(decide.row.entityType) : false
  const decideImage = decide ? isImageCase(decide.row.entityType) : false
  const imageSel = rows.filter((r) => sel.includes(r.caseId) && isImageCase(r.entityType)).length

  return (
    <div>
      <PageIntro
        title="New posts to check (AI)"
        lead="The AI held these posts back before anyone saw them. You decide what happens next."
        bullets={[
          'You can approve a post. It then goes live for everyone.',
          'You can reject a post. It then stays hidden.',
          'You can decide many posts at once (extra password check).',
          'You can ask the AI to score a post again.',
          'You can filter by content type, or show only posts past their time limit.',
          'You can also check flagged images here. Images work the other way: they are already live, and rejecting one deletes the image file forever.',
        ]}
      />
      <HowTo steps={[
        'Look at the three numbers at the top. They show how much work is waiting.',
        'Click a row to open the post and read the full text with its scores.',
        'Click "Approve" to put a post live, or "Reject" to keep it hidden.',
        'To decide many at once: tick their boxes, then click "Decide all ticked posts".',
        'Tick "Teach the AI" only when the AI was clearly wrong about the text itself.',
      ]} />
      <Note>
        This is <strong>not</strong> the <Link to="/moderation">Reported content</Link> page. That page is about
        posts people already saw and reported. Here, nobody has seen the post yet — only its author.
        Approve = the post goes live. Reject = it stays hidden.
        The one exception is <strong>images</strong>: a flagged image is <em>already live</em>.
        For an image, approve just closes the case, and reject deletes the image file forever.
        Private chat images never show up here — that is a firm rule, like chat text.
      </Note>
      {data?.note && <Note>{data.note}</Note>}
      {data?.warning && <Warn>{data.warning}</Warn>}
      {resp?.note && <Note>{resp.note}</Note>}
      {resp?.warning && <Warn>{resp.warning}</Warn>}

      <Tiles items={[
        { label: 'Waiting for a person', value: num(counts?.inReview), sub: 'held posts that need your decision' },
        { label: 'AI still working', value: num(counts?.pending), sub: 'if this grows and never falls, the AI computer may be down' },
        { label: 'Past the time limit (SLA)', value: num(counts?.slaBreached), sub: 'the wait time ran out before the AI answered' },
      ]} />

      <div className="filters">
        <Field label="Status">
          <Select value={f.status} onChange={(v) => set('status', v || 'IN_REVIEW')} options={STATUS_OPTIONS} allowEmpty={false} />
        </Field>
        <Field label="What kind of content"><Select value={f.entityType} onChange={(v) => set('entityType', v)} options={TYPE_OPTIONS} emptyLabel="(all kinds)" /></Field>
        <Field label="Time limit">
          <Select value={f.slaBreached} onChange={(v) => set('slaBreached', v)}
            options={[{ value: 'true', label: 'Past the limit only' }, { value: 'false', label: 'Still on time' }]} emptyLabel="(both)" />
        </Field>
        <Field label={<span title={SORT_HELP}>Order ⓘ</span>}>
          <Select value={f.sort} onChange={(v) => set('sort', v || 'risk')} allowEmpty={false}
            options={[{ value: 'risk', label: 'Riskiest first' }, { value: 'oldest', label: 'Oldest first' }]} />
        </Field>
        <Field label="Rows per page (max 100)">
          <Select value={f.pageSize} onChange={(v) => set('pageSize', Number(v) || 50)} options={['25', '50', '100']} allowEmpty={false} />
        </Field>
        <button className="secondary" onClick={reload}>Refresh the list</button>
      </div>
      <div className="filters">
        <Field label="Open a case by its id"><input className="w-id" value={openId} onChange={(e) => setOpenId(e.target.value)} placeholder="case id (UUID)" /></Field>
        <button disabled={!openId.trim()} onClick={() => nav(`/moderation/review/${openId.trim()}`)}>Open this case</button>
      </div>

      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />

      {sel.length > 0 && (
        <div className="toolbar">
          <strong>{sel.length} ticked</strong>
          <button
            disabled={!canDecide || overCap}
            title={gate || (overCap ? `You can send at most ${BULK_CAP} at once. Untick ${sel.length - BULK_CAP}.` : undefined)}
            onClick={() => { act.clear(); setResp(null); setBulkResults(null); setBulkOpen(true) }}
          >Decide all ticked posts… (extra password check)</button>
          <button className="secondary" onClick={() => setSel([])}>Untick all</button>
          {overCap && <span className="muted">You can send at most {BULK_CAP} at once. Untick {sel.length - BULK_CAP} first.</span>}
        </div>
      )}

      <DataTable
        columns={[
          {
            key: '_sel',
            label: <input type="checkbox" checked={allOn} title="Tick every post on this page" onChange={() => setSel(allOn ? [] : pageIds)} />,
            render: (r) => <input type="checkbox" checked={sel.includes(r.caseId)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.caseId)} />,
          },
          {
            key: 'entity', label: 'What is it', render: (r) => (
              <span className="row tight">
                <strong>{r.entityLabel || r.entityType || '—'}</strong>
                <Id v={r.entityRef} />
                {isRedacted(r.entityType) && <Badge kind="gray">private — text hidden</Badge>}
              </span>
            ),
          },
          {
            key: 'topLabel', label: 'Top AI score', render: (r) => (
              <span className="row tight">
                {/* MODEL_UNAVAILABLE rows carry a placeholder 0.0 — printing it would read as "the AI said safe". */}
                {String(r.reasonCode).toUpperCase() === 'MODEL_UNAVAILABLE'
                  ? <span className="muted">never scored — the AI was down</span>
                  : r.topLabel ? <><span>{r.topLabel}</span><span className="mono">{fmtScore(r.topScore)}</span></> : <span className="muted">—</span>}
                {r.blocklistHit ? <Badge kind="red">blocked word: {r.blocklistHit}</Badge> : null}
              </span>
            ),
          },
          { key: 'reasonCode', label: 'Why is it here', render: (r) => <ReasonBadge value={r.reasonCode} /> },
          {
            key: 'authorId', label: 'Who wrote it', render: (r) => (
              <span className="row tight">
                <Id v={r.authorId} />
                {r.authorPriorRejections > 0 ? <Badge kind="err">{r.authorPriorRejections} past rejections</Badge> : null}
              </span>
            ),
          },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'holdDeadline', label: 'Time left', render: (r) => <Countdown to={r.holdDeadline} breached={r.slaBreached} /> },
          { key: 'submittedAt', label: 'Sent in' },
          f.status !== 'IN_REVIEW' && { key: 'decidedAt', label: 'Decided' },
          {
            key: 'preview', label: 'First words', render: (r) => {
              // Image cases carry the image URL, not text — a link to look at, not words to read.
              if (isImageCase(r.entityType)) {
                return r.preview
                  ? <a href={mediaUrl(r.preview)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Open the image ↗</a>
                  : <span className="muted">—</span>
              }
              return r.preview
                ? <span className={`case-preview${isRedacted(r.entityType) ? ' muted' : ''}`} title={r.preview}>{r.preview}</span>
                : <span className="muted">—</span>
            },
          },
          {
            key: '_act', label: 'Actions', render: (r) => {
              // A case that is already APPROVED/REJECTED cannot be decided again.
              const decided = r.status === 'APPROVED' || r.status === 'REJECTED'
              const decidedTip = decided ? 'Already decided — nothing to do here' : undefined
              const img = isImageCase(r.entityType)
              return (
                <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="small" disabled={!canDecide || decided} title={decidedTip || gate} onClick={() => openDecide(r, 'APPROVE')}>Approve</button>
                  <button className="small danger" disabled={!canDecide || decided} title={decidedTip || gate} onClick={() => openDecide(r, 'REJECT')}>Reject</button>
                  <button className="small secondary" disabled={!canDecide || decided || act.busy || img}
                    title={decidedTip || gate || (img
                      ? 'Not for images — the text AI cannot score a picture, so only a person decides an image case.'
                      : 'The AI scores the stored text again. Useful right after a new AI version starts.')}
                    onClick={() => rescore(r)}>Score again</button>
                </span>
              )
            },
          },
        ].filter(Boolean)}
        rows={rows}
        rowKey={(r) => r.caseId}
        onRow={(r) => nav(`/moderation/review/${r.caseId}`)}
        loading={loading}
        tall
        empty="No posts are waiting for these filters. Nothing to do here right now."
      />
      <Pager data={data} page={page} onPage={goPage} />

      {bulkResults && (
        <div className="card">
          <h2>Result for each post ({bulkResults.filter((x) => x.outcome === 'ok').length} worked / {bulkResults.filter((x) => x.outcome !== 'ok').length} failed)</h2>
          <Note>Each post is tried on its own. Some can work while others fail — check every line.</Note>
          <DataTable
            columns={[
              { key: 'caseId', label: 'Case', render: (r) => <Id v={r.caseId} /> },
              { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome === 'ok' ? 'SUCCESS' : 'FAILED'} /> },
              { key: 'error', label: 'Problem' },
            ]}
            rows={bulkResults}
            rowKey={(r) => r.caseId}
            empty="The server sent back no per-post results."
          />
        </div>
      )}

      {decide && (
        <FormModal
          title={<>{decide.action === 'APPROVE' ? 'Approve' : 'Reject'} {decideImage ? 'image' : 'post'} <code>{short(decide.row.caseId)}</code></>}
          danger={decide.action === 'REJECT'}
          intro={decideImage
            ? (decide.action === 'APPROVE'
              ? 'Approve means: the case is closed. The image is already live, so nothing changes for users. If the image link is dead, the image was already deleted — approving just closes the case.'
              : 'Reject means: the image file is deleted forever — the original and every size of it. The author gets a message that their image was removed. The post keeps its text and other pictures; only this image goes away. There is no undo.')
            : `${decide.action === 'APPROVE'
              ? 'Approve means: the post is published and everyone can see it.'
              : 'Reject means: the post stays hidden. Only the author will know.'}${decideRedacted
              ? ' This is a private message. Staff cannot read the text, and "Teach the AI" is not possible here — the server ignores it.'
              : ''}`}
          fields={[
            {
              name: 'action', label: 'Action', type: 'select', required: true, value: decide.action,
              options: [{
                value: decide.action,
                label: decide.action === 'APPROVE'
                  ? (decideImage ? 'APPROVE — close the case' : 'APPROVE — put it live')
                  : (decideImage ? 'REJECT — delete the image forever' : 'REJECT — keep it hidden'),
              }],
            },
            { name: 'reason', label: 'Why? * (max 500 letters — saved in the action history)', type: 'textarea', required: true },
            // Teach only exists for text — the server silently skips it on images and private chat.
            !decideRedacted && !decideImage && { name: 'teachModel', label: 'Teach the AI from this decision', type: 'checkbox', value: false, help: TEACH_HELP },
          ].filter(Boolean)}
          submitLabel={decide.action === 'APPROVE'
            ? (decideImage ? 'Approve — close the case' : 'Approve — put it live')
            : (decideImage ? 'Reject — delete the image forever' : 'Reject — keep it hidden')}
          onSubmit={async (v) => {
            assertReason(v.reason)
            const r = await AutoModApi.decide(decide.row.caseId, { action: decide.action, reason: v.reason, teachModel: !!v.teachModel })
            setResp(r || null)
            act.setOk(decide.action === 'APPROVE'
              ? (decideImage ? 'Approved. The case is closed — the image was live already.' : 'Approved. The post is now live.')
              : (decideImage ? 'Rejected. The image is being deleted and the author gets a message.' : 'Rejected. The post stays hidden.'))
            setSel((s) => s.filter((x) => x !== decide.row.caseId))
            reload()
          }}
          onClose={() => setDecide(null)}
        />
      )}

      {bulkOpen && (
        <FormModal
          title={`Decide ${sel.length} post${sel.length === 1 ? '' : 's'} at once`}
          danger requireText="BULK" wide
          intro={`Only do this after you opened and checked a few of them. Each post is tried on its own — some can fail while others work, so read the results list after. ${sel.length} ticked${redactedSel ? `, ${redactedSel} of them are private messages where "Teach the AI" is ignored by the server` : ''}${imageSel ? `, ${imageSel} of them are IMAGES — rejecting an image deletes the image file forever (no undo), and "Teach the AI" is ignored for images` : ''}.`}
          fields={[
            {
              name: 'action', label: 'Action *', type: 'select', required: true, value: 'APPROVE',
              options: [{ value: 'APPROVE', label: 'APPROVE — put them live' }, { value: 'REJECT', label: 'REJECT — keep them hidden' }],
            },
            { name: 'reason', label: 'Why? * (max 500 letters — saved on every post)', type: 'textarea', required: true },
            { name: 'teachModel', label: 'Teach the AI from these decisions', type: 'checkbox', value: false, help: TEACH_HELP },
          ]}
          submitLabel="Run now (extra password check)"
          onSubmit={async (v) => {
            assertReason(v.reason)
            const r = await AutoModApi.bulk({ action: v.action, caseIds: sel, reason: v.reason, teachModel: !!v.teachModel })
            const list = Array.isArray(r) ? r : []
            setBulkResults(list)
            // A green banner saying "submitted" would read as "all done" on a batch that half-failed.
            act.setOk(list.length
              ? `${list.filter((x) => x.outcome === 'ok').length} of ${list.length} worked — check the list below for each post.`
              : 'Sent, but the server returned no per-post results.')
            setSel([])
            reload()
          }}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  )
}
