import React, { useState } from 'react'
import { NotificationsApi } from '../../api'
import { useLoad, useAction, pageRows } from '../../util'
import { PageIntro, HowTo, DataTable, Pager, Err, Ok, Note, Warn, Loading, Field, Select, StatusBadge, Confirm } from '../../components/ui'

const ROLES = ['USER', 'RESEARCHER', 'SCHOLAR', 'MODERATOR', 'SUPPORT', 'ANALYST', 'ADMIN']
// Plain names around the raw language codes. The value sent to the server never changes.
const LANGS = [
  { value: 'EN', label: 'English (EN)' },
  { value: 'AR', label: 'Arabic (AR)' },
  { value: 'CKB', label: 'Kurdish — Sorani (CKB)' },
]

export default function AnnouncementsPage() {
  const act = useAction()
  const [f, setF] = useState({ title: '', body: '', audienceRole: '', activeSinceDays: '', audienceLanguage: '', scheduledAt: '', confirmLargeAudience: false })
  const [dryResult, setDryResult] = useState(null)
  const [askSend, setAskSend] = useState(false)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [page, setPage] = useState(0)
  const history = useLoad(() => NotificationsApi.announcements({ page, size: 25 }), [page])
  // Any change to the message or audience makes the old safe-test count stale.
  const set = (k, v) => {
    setF((s) => ({ ...s, [k]: v }))
    if (k !== 'confirmLargeAudience') setDryResult(null)
  }

  const buildBody = (dryRun) => ({
    title: f.title, body: f.body,
    audienceRole: f.audienceRole || undefined,
    activeSinceDays: f.activeSinceDays ? Number(f.activeSinceDays) : undefined,
    audienceLanguage: f.audienceLanguage || undefined,
    scheduledAt: f.scheduledAt || undefined,
    dryRun,
    confirmLargeAudience: f.confirmLargeAudience,
  })

  const dryRun = async () => {
    const r = await act.run(() => NotificationsApi.compose(buildBody(true)), null)
    if (r) { setDryResult(r); act.setOk(`Safe test done: about ${r.audience} user(s) would get this. Nothing was sent.`) }
  }
  const realSend = async () => {
    const r = await act.run(() => NotificationsApi.compose(buildBody(false)), null)
    setAskSend(false)
    if (r) {
      act.setOk(r.scheduledAt
        ? `Saved. The announcement will send at ${r.scheduledAt}. You can cancel it below until then.`
        : `Sending started to about ${r.audience} user(s). This runs in the background.`)
      setDryResult(null)
      history.reload()
    }
  }

  return (
    <div>
      <PageIntro
        title="Announcements"
        lead="Send one message to many users at the same time."
        bullets={[
          'You can write a message and pick who gets it.',
          'You can first count who would get it, without sending anything (safe test).',
          'You can send now, or set a date and time to send later.',
          'You can see past announcements and cancel ones that still wait to send.',
        ]}
      />
      <HowTo steps={[
        'Write a title and a message.',
        'If you want fewer people, pick filters: a role, a language, or "active in the last … days".',
        'Click "Step 1: Safe test". It only counts people. It sends nothing.',
        'Check the number. If it looks right, click "Step 2: Send for real".',
        'Type SEND in the box to confirm. You may also need to enter your password again (extra password check).',
      ]} />
      <Warn>Be careful. This tool can message every user in the app. Always run the safe test first.</Warn>

      <div className="card">
        <h2>Write a new announcement</h2>
        <div className="field"><span>Title (required)</span><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Short headline users will see" /></div>
        <div className="field mt-2"><span>Message (required)</span><textarea value={f.body} onChange={(e) => set('body', e.target.value)} placeholder="What do you want to tell users?" /></div>
        <div className="filters mt-2">
          <Field label="Only people with this role"><Select value={f.audienceRole} onChange={(v) => set('audienceRole', v || '')} options={ROLES} emptyLabel="(everyone)" /></Field>
          <Field label="Only people active in the last … days"><input type="number" min={1} value={f.activeSinceDays} onChange={(e) => set('activeSinceDays', e.target.value)} placeholder="any" /></Field>
          <Field label="Only this language"><Select value={f.audienceLanguage} onChange={(v) => set('audienceLanguage', v || '')} options={LANGS} emptyLabel="(all languages)" /></Field>
          <Field label="Send later at (leave empty to send now)"><input type="datetime-local" value={f.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} /></Field>
        </div>
        <label className="check-row mt-2">
          <input type="checkbox" checked={f.confirmLargeAudience} onChange={(e) => set('confirmLargeAudience', e.target.checked)} />
          <span>Yes, I really want to message this very large group. (Only needed when half of all users, or more, would get it. The server blocks the send without this.)</span>
        </label>
        <div className="row">
          <button className="secondary" disabled={act.busy || !f.title || !f.body} onClick={dryRun}>
            Step 1: Safe test — count people (sends nothing)
          </button>
          <button disabled={act.busy || !f.title || !f.body || !dryResult} title={!dryResult ? 'Run the safe test first.' : ''} onClick={() => setAskSend(true)}>
            Step 2: {f.scheduledAt ? 'Schedule the send' : 'Send for real'}
          </button>
        </div>
        <Err e={act.err} /><Ok msg={act.ok} />
        {dryResult && <Note>Safe test result: about <strong>{dryResult.audience}</strong> user(s) would get this message. If you change anything above, run the safe test again.</Note>}
      </div>

      <div className="card">
        <h2>Past and waiting announcements</h2>
        <Err e={history.err} /><Loading on={history.loading} />
        <DataTable
          columns={[
            { key: 'createdAt', label: 'When created' },
            { key: 'title', label: 'Title' },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
            { key: 'audienceRole', label: 'Role filter' },
            { key: 'audienceLanguage', label: 'Language' },
            { key: 'scheduledAt', label: 'Will send at' },
            { key: 'targetedCount', label: 'People targeted' },
            { key: 'deliveredCount', label: 'Delivered' },
            {
              key: '_', label: '', render: (r) => r.status === 'SCHEDULED' && (
                <button className="small danger" onClick={() => setCancelTarget(r)}>Cancel this send</button>
              )
            },
          ]}
          rows={pageRows(history.data)}
          loading={history.loading}
          empty="No announcements yet. Nothing was sent so far."
        />
        <Pager data={history.data} page={page} onPage={setPage} />
      </div>

      {askSend && (
        <Confirm
          title={f.scheduledAt ? 'Schedule this announcement?' : 'Send this announcement now?'}
          message={f.scheduledAt
            ? `This saves "${f.title}" to send at ${f.scheduledAt}. About ${dryResult?.audience ?? '?'} user(s) will get it then. You can still cancel it before that time.`
            : `This sends "${f.title}" to about ${dryResult?.audience ?? '?'} user(s) right now. You cannot take it back.`}
          requireText="SEND"
          confirmLabel={f.scheduledAt ? 'Yes, schedule it' : 'Yes, send it'}
          danger={false}
          busy={act.busy}
          onClose={() => setAskSend(false)}
          onConfirm={realSend}
        />
      )}
      {cancelTarget && (
        <Confirm
          title="Cancel this announcement?"
          message={`"${cancelTarget.title}" is waiting to send. If you cancel it, it will never be sent. You may need to enter your password again (extra password check).`}
          confirmLabel="Yes, cancel the send"
          busy={act.busy}
          onClose={() => setCancelTarget(null)}
          onConfirm={async () => {
            const r = await act.run(() => NotificationsApi.cancelAnnouncement(cancelTarget.id), 'The scheduled announcement was cancelled. It will not be sent.')
            setCancelTarget(null)
            if (r !== undefined) history.reload()
          }}
        />
      )}
    </div>
  )
}
