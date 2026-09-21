import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { SafetyApi } from '../../api'
import { useLoad, useAction } from '../../util'
import { PageIntro, HowTo, Err, Ok, Note, Warn, Loading, KV, DataTable, StatusBadge, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'

// Raw enum values stay as sent to the server; only the labels are plain words.
const RESOLUTION_OPTIONS = [
  { value: 'WARNING_ISSUED', label: 'We warned the user (WARNING_ISSUED)' },
  { value: 'CONTENT_REMOVED', label: 'We removed the content (CONTENT_REMOVED)' },
  { value: 'ACCOUNT_SUSPENDED', label: 'We suspended the account (ACCOUNT_SUSPENDED)' },
  { value: 'NO_ACTION', label: 'We did nothing — report was wrong (NO_ACTION)' },
]

export default function ReportDetailPage() {
  const { id } = useParams()
  const { data, err, loading, reload } = useLoad(() => SafetyApi.report(id), [id])
  const act = useAction()
  const [modal, setModal] = useState(null)
  const r = data?.report
  const ev = data?.evidence

  const done = (msg) => { act.setOk(msg); reload() }

  return (
    <div>
      <Link className="backlink" to="/safety">← Back to user reports</Link>
      <PageIntro
        title="One report"
        lead="Check this report, look at the saved proof, and decide what to do."
        bullets={[
          'You can read what the reporters wrote.',
          'You can see a saved copy (frozen proof) of the reported content.',
          'You can do the first check, close the report, or record an action.',
          'If the reporter appealed, you can keep or undo the old decision.',
        ]}
      />
      <div className="page-id">report id: {id}</div>
      <HowTo steps={[
        'Read the report facts and the saved proof below.',
        'If the report is new, press "Start the first check" so others know you looked at it.',
        'If the content is fine, press "Close — no rule broken".',
        'If a rule was broken, press "Record what we did" and pick the result. This saves the decision only — remove content on the "Find & remove content" page, and disable accounts on the user\'s page.',
        'If the reporter appealed, check the proof again. "Keep the decision" says the appeal is wrong. "Undo the decision" says the appeal is right.',
      ]} />
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <Loading on={loading} />
      {r && (
        <>
          <div className="row">
            <StatusBadge value={r.state} />
            {r.resolution && r.resolution !== 'NONE' && <span className="badge">{r.resolution}</span>}
          </div>
          <Note>
            The result of a report is private. Reporters only see a rough result
            ("under review", "action taken"). Never tell a reporter the exact result.
          </Note>
          {r.state === 'APPEALED' && (
            <Warn>
              The reporter asked us to look at this report again (appeal). Check the proof one more
              time. "Undo the decision" also cancels any warning linked to this report.
            </Warn>
          )}
          <div className="toolbar">
            {['SUBMITTED'].includes(r.state) && (
              <button onClick={() => setModal('triage')} title="POST /api/v1/admin/safety/reports/{id}/triage">Start the first check…</button>
            )}
            {['SUBMITTED', 'TRIAGED'].includes(r.state) && (
              <button className="secondary" onClick={() => setModal('dismiss')} title="POST /api/v1/admin/safety/reports/{id}/dismiss">Close — no rule broken…</button>
            )}
            {['SUBMITTED', 'TRIAGED'].includes(r.state) && (
              <button className="secondary" onClick={() => setModal('action')} title="POST /api/v1/admin/safety/reports/{id}/action">Record what we did…</button>
            )}
            {r.state === 'APPEALED' && (
              <button onClick={() => setModal('uphold')} title="POST /api/v1/admin/safety/appeals/{id}/uphold">Keep the decision…</button>
            )}
            {r.state === 'APPEALED' && (
              <button className="danger" onClick={() => setModal('reverse')} title="POST /api/v1/admin/safety/appeals/{id}/reverse">Undo the decision…</button>
            )}
          </div>
          <div className="grid2">
            <div className="card">
              <h2>Report facts</h2>
              <KV obj={{
                'Who reported it (id)': r.reporterId,
                'What was reported': r.targetType,
                'Item id': r.targetRef,
                'Why (reason)': r.reason,
                'Status': r.state,
                'Result (resolution)': r.resolution,
                'What the reporter wrote': r.details,
                'Notes from our team': r.moderatorNote,
                'First check by': r.triagedBy,
                'First check at': r.triagedAt,
                'Decided by': r.actionedBy,
                'Decided at': r.actedAt,
                'Reported at': r.createdAt,
                'Group key': r.groupKey,
              }} />
              {r.targetType === 'USER' && r.targetRef && (
                <p><Link to={`/safety/record?userId=${r.targetRef}`}>→ See this user's record</Link></p>
              )}
            </div>
            <div className="card">
              <h2>Saved proof (copy made when the report came in)</h2>
              {ev ? (
                <>
                  <KV obj={{
                    'Who wrote it (id)': ev.authorId,
                    'Saved text': ev.contentText,
                    'Media files (storage keys)': ev.mediaRefs,
                    'State when saved': ev.entityState,
                    'Copy saved at': ev.capturedAt,
                    'Item id': ev.targetRef,
                  }} />
                  {ev.authorId && (
                    <p><Link to={`/safety/record?userId=${ev.authorId}`}>→ See the author's record</Link></p>
                  )}
                </>
              ) : (
                <Warn>
                  No saved copy exists for this report. Live-stream chat is never saved, so those
                  reports have no content to show — decide with the other facts you have.
                </Warn>
              )}
            </div>
          </div>
          <div className="card">
            <h2>All reports in this group ({data.group?.length || 0}, oldest first)</h2>
            <p className="muted">People who report the same item for the same reason land in one group. One decision usually closes the whole group.</p>
            <DataTable
              columns={[
                { key: 'createdAt', label: 'When' },
                { key: 'reporterId', label: 'Who reported it', render: (x) => <Id v={x.reporterId} /> },
                { key: 'state', label: 'Status', render: (x) => <StatusBadge value={x.state} /> },
                { key: 'details', label: 'What the reporter wrote' },
                { key: 'id', label: '', render: (x) => x.id !== id ? <Link to={`/safety/reports/${x.id}`}>Open</Link> : <em>this one</em> },
              ]}
              rows={data.group || []}
              loading={loading}
              empty="No other reports in this group."
            />
          </div>
          <div className="card">
            <h2>Warnings (strikes) linked to this report</h2>
            <DataTable
              columns={[
                { key: 'issuedAt', label: 'Given at' },
                { key: 'userId', label: 'User', render: (x) => <Id v={x.userId} /> },
                { key: 'reason', label: 'Reason' },
                { key: 'active', label: 'Still counts?' },
                { key: 'expiresAt', label: 'Ends at' },
              ]}
              rows={data.linkedStrikes || []}
              loading={loading}
              empty="No warnings are linked to this report."
            />
          </div>
        </>
      )}

      {modal === 'triage' && (
        <FormModal title="Start the first check"
          intro='This marks the report as "looked at" (SUBMITTED → TRIAGED). It does not punish anyone.'
          fields={[
            { name: 'note', label: 'Note for the team (up to 1000 letters)', type: 'textarea', placeholder: 'Example: Looks real. Needs a decision.' },
            { name: 'wholeGroup', label: 'Also mark every other report in this group', type: 'checkbox', value: true },
          ]}
          submitLabel="Mark as checked"
          onSubmit={async (v) => { await SafetyApi.triage(id, v); done('Done. The report is marked as checked.') }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'dismiss' && (
        <FormModal title="Close — no rule broken"
          intro='This closes the report with the result "no action". Use it when the content is fine.'
          fields={[
            { name: 'note', label: 'Note for the team', type: 'textarea', placeholder: 'Example: The post does not break any rule.' },
            { name: 'wholeGroup', label: 'Also close every other open report in this group', type: 'checkbox', value: true },
          ]}
          submitLabel="Close this report"
          onSubmit={async (v) => { await SafetyApi.dismiss(id, v); done('Done. The report is closed.') }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'action' && (
        <FormModal title="Record what we did"
          intro={'This saves the decision only. It does not remove content or suspend accounts by itself — do that on the "Find & remove content" page or the user\'s page. You will be asked for the extra password check (step-up).'}
          fields={[
            { name: 'resolution', label: 'What did we do? *', type: 'select', options: RESOLUTION_OPTIONS, required: true },
            { name: 'note', label: 'Note for the team', type: 'textarea', placeholder: 'Example: Checked the saved proof. The post breaks the bullying rule.' },
            { name: 'issueStrike', label: 'Also give the reported user a warning (only works when a user was reported)', type: 'checkbox' },
            { name: 'strikeReason', label: 'Warning reason (up to 200 letters)', placeholder: 'Example: Bullying in post replies', help: 'The user sees this text. Never copy what the reporter wrote.' },
            { name: 'wholeGroup', label: 'Also close every other open report in this group', type: 'checkbox', value: true },
          ]}
          submitLabel="Save the decision"
          onSubmit={async (v) => { await SafetyApi.action(id, v); done('Done. The decision is saved.') }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'uphold' && (
        <FormModal title="Keep the decision"
          intro="This rejects the appeal. The old decision stays. You will be asked for the extra password check (step-up)."
          fields={[{ name: 'note', label: 'Note for the team', type: 'textarea', placeholder: 'Example: Checked again. The first decision was right.' }]}
          submitLabel="Keep the decision"
          onSubmit={async (v) => { await SafetyApi.appealUphold(id, v.note); done('Done. The old decision stays.') }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'reverse' && (
        <FormModal title="Undo the decision" danger
          intro="This accepts the appeal and undoes the old decision. Any warning linked to this report is cancelled automatically. If content was removed, it is flagged so someone can restore it. You will be asked for the extra password check (step-up)."
          fields={[{ name: 'note', label: 'Note for the team', type: 'textarea', placeholder: 'Example: The proof does not support the old decision.' }]}
          submitLabel="Undo the decision"
          onSubmit={async (v) => { await SafetyApi.appealReverse(id, v.note); done('Done. The old decision is undone.') }}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}
