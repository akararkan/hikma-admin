import React, { useState } from 'react'
import { ActivityApi } from '../../api'
import { useLoad, useAction, pageRows, saveBlob, filenameFromDisposition } from '../../util'
import { DataTable, Pager, Err, Ok, Note, Warn, Field, Select, Tabs, KV, StatusBadge, JsonBlock, PageIntro, HowTo, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'
import { useAuth } from '../../auth/AuthContext'

const CASE_KINDS = [
  { value: 'LEGAL_HOLD', label: 'Saved for a legal case (LEGAL_HOLD)' },
  { value: 'LAW_ENFORCEMENT', label: 'Police or court request (LAW_ENFORCEMENT)' },
  { value: 'SAFETY_INVESTIGATION', label: 'Safety check on this user (SAFETY_INVESTIGATION)' },
]

const ACTIVITY_TYPES = ['POST_CREATED', 'POST_REACTION', 'POST_COMMENT', 'POST_COMMENT_REACTION', 'POST_SHARE', 'POST_SAVED', 'REEL_WATCH', 'GLOBAL_SEARCH', 'HASHTAG_SEARCH', 'MENTION_LOOKUP', 'USER_MENTIONED', 'PROFILE_VIEW', 'FOLLOWED_USER', 'QNA_QUESTION_CREATED', 'QNA_QUESTION_SAVED', 'QNA_ANSWER_CREATED', 'QNA_REANSWER_CREATED', 'QNA_ANSWER_REACTION', 'QNA_ANSWER_FEEDBACK', 'RESEARCH_PUBLISHED', 'RESEARCH_SAVED', 'RESEARCH_REACTION', 'RESEARCH_COMMENT', 'RESEARCH_COMMENT_REACTION', 'STORY_VIEWED', 'STORY_REACTED', 'STORY_REPLIED', 'STORY_POLL_VOTED', 'SOUND_USED']

export default function ActivityPage() {
  const [tab, setTab] = useState('cases')
  return (
    <div>
      <PageIntro
        title="Emergency access"
        lead="Read one user's private activity — only for a legal case or a safety case (break-glass)."
        bullets={[
          'You can open an access case for one user, with a reason.',
          'You can approve a case that ANOTHER admin opened.',
          'You can read and download the user\'s activity while the case is open.',
          'You can close a case to end the access early.',
          'You can delete a user\'s activity forever (GDPR). This needs no case.',
        ]}
      />
      <Warn>A user's activity list is very private. It shows what they searched and whose profiles they looked at. The normal rule is: no access. Access needs two different admins — one opens a case, a second one approves it. Every read is saved in the action history. A case ends by itself 7 days after it was opened.</Warn>
      <HowTo steps={[
        'On the "Access cases" tab, click "Open a new case". Enter the user id, pick the case type, and write why you need access.',
        'Ask a DIFFERENT admin to open this page and click "Approve (second admin)". The app blocks you from approving your own case.',
        'When the case shows OPEN, go to the "Read activity" tab. Enter the same user id and use the buttons there.',
        'If you need the data as evidence, click one of the download buttons.',
        'When you are done, go back to "Access cases" and click "Close the case". This ends the access early.',
      ]} />
      <Tabs tabs={[
        { id: 'cases', label: 'Access cases' },
        { id: 'reads', label: 'Read activity' },
        { id: 'erase', label: 'Delete activity (GDPR)' },
      ]} active={tab} onChange={setTab} />
      {tab === 'cases' && <Cases />}
      {tab === 'reads' && <Reads />}
      {tab === 'erase' && <Erase />}
    </div>
  )
}

function Cases() {
  const { user } = useAuth()
  const [page, setPage] = useState(0)
  const { data, err, loading, reload } = useLoad(() => ActivityApi.cases({ page, size: 25 }), [page])
  const act = useAction()
  const [openModal, setOpenModal] = useState(false)
  return (
    <div>
      <div className="toolbar">
        <button onClick={() => setOpenModal(true)} title="POST /api/v1/admin/breakglass/{targetUserId}">Open a new case</button>
        <button className="secondary" onClick={reload} title="GET /api/v1/admin/breakglass/cases">Refresh the list</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'openedAt', label: 'Opened on' },
          { key: 'targetUserId', label: 'Which user', render: (r) => <Id v={r.targetUserId} /> },
          {
            key: 'kind', label: 'Case type', render: (r) => (
              CASE_KINDS.find((k) => k.value === r.kind)?.label || r.kind
            )
          },
          { key: 'reason', label: 'Why' },
          { key: 'caseRef', label: 'Outside case number' },
          { key: 'openedBy', label: 'Opened by', render: (r) => <Id v={r.openedBy} /> },
          { key: 'approvedBy', label: 'Approved by', render: (r) => <Id v={r.approvedBy} /> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'openNow', label: 'Access open now?' },
          { key: 'expiresAt', label: 'Ends on' },
          {
            key: '_', label: 'What you can do', render: (r) => {
              const isOpener = user?.id && r.openedBy === user.id
              return (
                <span className="row-actions">
                  {r.status === 'PENDING_APPROVAL' && (
                    <button className="small" disabled={isOpener || act.busy}
                      title={isOpener ? 'Two-person rule: you opened this case, so a different admin must approve it.' : 'POST /api/v1/admin/breakglass/cases/{caseId}/approve'}
                      onClick={async () => { await act.run(() => ActivityApi.approveCase(r.id), 'Case approved. Reading is now allowed until the case ends.'); reload() }}>
                      Approve (second admin)
                    </button>
                  )}
                  {r.status !== 'CLOSED' && (
                    <button className="small secondary" disabled={act.busy} title="POST /api/v1/admin/breakglass/cases/{caseId}/close"
                      onClick={async () => { await act.run(() => ActivityApi.closeCase(r.id), 'Case closed. The access has ended.'); reload() }}>
                      Close the case
                    </button>
                  )}
                </span>
              )
            }
          },
        ]}
        rows={pageRows(data)}
        loading={loading}
        empty="No access cases yet. Nothing to do here right now."
      />
      <Pager data={data} page={page} onPage={setPage} />
      {openModal && (
        <FormModal title="Open an emergency access case" danger
          intro="The case starts as waiting for approval. It gives no access until a SECOND admin approves it. It ends by itself 7 days after you open it. The app will ask for your password again (step-up)."
          fields={[
            { name: 'targetUserId', label: 'User id *', required: true },
            { name: 'kind', label: 'Case type *', type: 'select', options: CASE_KINDS, required: true },
            { name: 'reason', label: 'Why do you need access? * (10 to 1000 letters)', type: 'textarea', required: true },
            { name: 'caseRef', label: 'Outside case number (ticket or court order), if you have one' },
          ]}
          submitLabel="Open the case"
          onSubmit={async (v) => { await ActivityApi.openCase(v.targetUserId, { kind: v.kind, reason: v.reason, caseRef: v.caseRef }); act.setOk('Case opened. Now a DIFFERENT admin must approve it.'); reload() }}
          onClose={() => setOpenModal(false)} />
      )}
    </div>
  )
}

function Reads() {
  const act = useAction()
  const [userId, setUserId] = useState('')
  const [type, setType] = useState(undefined)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [windowDays, setWindowDays] = useState(90)
  const [timeline, setTimeline] = useState(null)
  const [summary, setSummary] = useState(null)
  const [reels, setReels] = useState(null)
  const [reelsMore, setReelsMore] = useState(false)

  const range = () => ({ from: from || undefined, to: to || undefined })

  async function loadReels(cursor) {
    const r = await act.run(() => ActivityApi.reelsWatched(userId, { pageSize: 50, cursor }), 'Watched-reels list loaded. This read was saved in the action history.')
    if (r) {
      setReels((prev) => (cursor ? [...(prev || []), ...r] : r))
      setReelsMore(r.length === 50)
    }
  }

  return (
    <div className="card">
      <Note>These reads only work while a case for this user is OPEN. Without one, the server says no (403 BREAKGLASS_CASE_REQUIRED). Every read is saved in the action history, and needs your password again (step-up).</Note>
      <div className="filters">
        <Field label="User id *"><input value={userId} onChange={(e) => setUserId(e.target.value)} className="w-id" placeholder="Paste the user id here" /></Field>
        <Field label="Show only this type"><Select value={type} onChange={setType} options={ACTIVITY_TYPES} emptyLabel="(all types)" /></Field>
        <Field label="From"><input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Count over how many days? (1 to 365)"><input type="number" min={1} max={365} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value) || 90)} /></Field>
      </div>
      <div className="toolbar">
        <button disabled={!userId || act.busy} title="GET /api/v1/admin/users/{userId}/activity" onClick={async () => {
          const r = await act.run(() => ActivityApi.activity(userId, { types: type ? [type] : undefined, ...range(), size: 50 }), 'Activity list loaded. This read was saved in the action history.')
          if (r) setTimeline(r)
        }}>Show the activity list</button>
        <button className="secondary" disabled={!userId || act.busy} title="GET /api/v1/admin/users/{userId}/activity/summary" onClick={async () => {
          const r = await act.run(() => ActivityApi.summary(userId, windowDays), 'Counts loaded. This read was saved in the action history.')
          if (r) setSummary(r)
        }}>Show counts by type</button>
        <button className="secondary" disabled={!userId || act.busy} title="GET /api/v1/admin/users/{userId}/reels/watched" onClick={() => loadReels(undefined)}>Show watched reels</button>
        <button className="secondary" disabled={!userId || act.busy} title="GET /api/v1/admin/users/{userId}/activity/export?format=csv" onClick={async () => {
          const r = await act.run(() => ActivityApi.exportActivity(userId, { ...range(), format: 'csv' }), 'File downloaded. The download was saved in the action history.')
          if (r?.blob) saveBlob(r.blob, filenameFromDisposition(r.headers, `activity-${userId}.csv`))
        }}>Download as CSV file</button>
        <button className="secondary" disabled={!userId || act.busy} title="GET /api/v1/admin/users/{userId}/activity/export?format=json" onClick={async () => {
          const r = await act.run(() => ActivityApi.exportActivity(userId, { ...range(), format: 'json' }), 'File downloaded. The download was saved in the action history.')
          if (r?.blob) saveBlob(r.blob, filenameFromDisposition(r.headers, `activity-${userId}.json`))
        }}>Download as JSON file</button>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      {summary && (
        <>
          <h3>Counts by type (last {windowDays} days)</h3>
          <Note>Types with zero actions are not shown. The names are the raw type codes from the server.</Note>
          <KV obj={summary} />
        </>
      )}
      {timeline && (
        <>
          <h3>Activity list</h3>
          <Note>The list shows only the newest rows (up to 50). Use the date boxes above to look further back, then click "Show the activity list" again.</Note>
          <DataTable
            columns={[
              { key: 'createdAt', label: 'When' },
              { key: 'activityType', label: 'Type', render: (r) => <code>{r.activityType}</code> },
              { key: 'label', label: 'What happened' },
              { key: 'subtitle', label: 'More detail' },
              { key: 'query', label: 'Search words' },
              { key: 'hitCount', label: 'Results found' },
            ]}
            rows={pageRows(timeline)}
            empty="No activity rows in this range."
          />
        </>
      )}
      {reels && (
        <>
          <h3>Watched reels (newest first)</h3>
          <DataTable
            columns={[
              { key: 'watchedAt', label: 'Watched on' },
              { key: 'postId', label: 'Reel id', render: (r) => <Id v={r.postId} /> },
              { key: 'watchedSeconds', label: 'Seconds watched' },
            ]}
            rows={reels}
            empty="No watched reels."
          />
          {reelsMore && reels.length > 0 && (
            <button className="small secondary mt-2" disabled={act.busy}
              onClick={() => loadReels(reels[reels.length - 1]?.watchedAt)}>
              Show older watches
            </button>
          )}
        </>
      )}
    </div>
  )
}

function Erase() {
  const act = useAction()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState(null)
  return (
    <div className="card">
      <Note>This really deletes the rows. There is no undo. It is allowed WITHOUT a case, because users may also delete their own activity. Each run deletes at most about 10,000 rows — for a very big history, run it again.</Note>
      <button className="danger" onClick={() => setOpen(true)} title="POST /api/v1/admin/users/{userId}/activity/erase">Delete a user's activity forever…</button>
      <Err e={act.err} /><Ok msg={act.ok} />
      {result && <JsonBlock v={result} />}
      {open && (
        <FormModal title="Delete activity forever" danger requireText="ERASE"
          intro="This deletes the user's activity rows for everyone. You cannot undo it. Leave the type empty to delete ALL types. The app will ask for your password again (step-up)."
          fields={[
            { name: 'userId', label: 'User id *', required: true },
            { name: 'type', label: 'Only this type (leave empty = all types)', type: 'select', options: ACTIVITY_TYPES },
            { name: 'reason', label: 'Why? (up to 500 letters — saved in the action history, e.g. a GDPR request number)', type: 'textarea' },
          ]}
          submitLabel="Delete forever"
          onSubmit={async (v) => {
            const r = await ActivityApi.erase(v.userId, { type: v.type, reason: v.reason })
            setResult(r); act.setOk(`Deleted ${r?.deleted ?? 0} row(s). If the user had more rows, run it again. ${r?.note || ''}`)
          }}
          onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
