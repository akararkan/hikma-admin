import React, { useState } from 'react'
import { LegalHoldsApi } from '../../api'
import { useLoad, useAction, pageRows, saveBlob } from '../../util'
import { DataTable, Pager, Err, Ok, Warn, Field, Select, StatusBadge, JsonBlock, Modal, KV, Id, PageIntro, HowTo } from '../../components/ui'
import FormModal from '../../components/FormModal'
import { useAuth } from '../../auth/AuthContext'

export default function LegalHoldsPage() {
  const { user } = useAuth()
  const [status, setStatus] = useState(undefined)
  const [page, setPage] = useState(0)
  const { data, err, loading, reload } = useLoad(() => LegalHoldsApi.list({ status, page, size: 25 }), [status, page])
  const act = useAction()
  const [modal, setModal] = useState(null)
  const [release, setRelease] = useState(null)
  const [detail, setDetail] = useState(null)
  const done = (msg) => { act.setOk(msg); reload() }

  return (
    <div>
      <PageIntro
        title="Legal holds"
        lead="A legal hold is the one legal way to hand over chat messages for a court case."
        bullets={[
          'You can start a hold on one conversation, with a case number.',
          'You can approve or reject a hold that ANOTHER admin started.',
          'You can release the messages one time, after approval.',
          'You can see the history of every hold and who did what.',
        ]}
      />
      <Warn>Everywhere else in this dashboard, message text is hidden. This page is the ONLY exception, and it needs two different admins: one starts the hold, a second one approves it. You can never approve your own hold. The release gives at most the newest 500 messages, one time only.</Warn>
      <HowTo steps={[
        'Click "Start a new hold". Enter the conversation id and the case number (court order or ticket number).',
        'Ask a DIFFERENT admin to open this page and click "Approve". The app blocks you from approving your own hold.',
        'When the hold says APPROVED, click "Release messages". This works one time only and can never be run again.',
        'Save the released messages the way your evidence rules say. The hold then shows EXECUTED forever.',
      ]} />
      <div className="filters">
        <Field label="Status"><Select value={status} onChange={(v) => { setPage(0); setStatus(v) }} options={[
          { value: 'OPEN', label: 'Waiting for a second admin (OPEN)' },
          { value: 'APPROVED', label: 'Approved — release unlocked (APPROVED)' },
          { value: 'EXECUTED', label: 'Messages released (EXECUTED)' },
          { value: 'REJECTED', label: 'Rejected (REJECTED)' },
        ]} /></Field>
        <button onClick={() => setModal({ kind: 'open' })} title="POST /api/v1/admin/chat/legal-holds">Start a new hold</button>
        <button className="secondary" onClick={reload} title="GET /api/v1/admin/chat/legal-holds">Refresh the list</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'openedAt', label: 'Started on' },
          { key: 'conversationId', label: 'Conversation', render: (r) => <Id v={r.conversationId} /> },
          { key: 'reason', label: 'Case number' },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'openedBy', label: 'Started by', render: (r) => <Id v={r.openedBy} /> },
          { key: 'approvedBy', label: 'Decided by', render: (r) => r.approvedBy ? <Id v={r.approvedBy} /> : null },
          { key: 'messageCount', label: 'Messages released' },
          {
            key: '_', label: 'What you can do', render: (r) => {
              const isOpener = user?.id && r.openedBy === user.id
              return (
                <span className="row-actions">
                  {r.status === 'OPEN' && (
                    <button className="small" disabled={isOpener}
                      title={isOpener ? 'Two-person rule: you started this hold, so a different admin must approve it.' : 'POST /api/v1/admin/chat/legal-holds/{id}/approve'}
                      onClick={(e) => { e.stopPropagation(); setModal({ kind: 'approve', r }) }}>Approve (second admin)</button>
                  )}
                  {r.status === 'OPEN' && <button className="small secondary" onClick={(e) => { e.stopPropagation(); setModal({ kind: 'reject', r }) }} title="POST /api/v1/admin/chat/legal-holds/{id}/reject">Reject</button>}
                  {r.status === 'APPROVED' && <button className="small danger" onClick={(e) => { e.stopPropagation(); setModal({ kind: 'execute', r }) }} title="POST /api/v1/admin/chat/legal-holds/{id}/execute">Release messages</button>}
                </span>
              )
            }
          },
        ]}
        rows={pageRows(data)}
        onRow={(r) => setDetail(r)}
        loading={loading}
        empty="No legal holds. Nothing to do here right now."
      />
      <Pager data={data} page={page} onPage={setPage} />

      {detail && (
        <Modal title="Legal hold — full record" onClose={() => setDetail(null)}>
          <p className="modal-lead">Every hold shows who started it and who decided on it. This record cannot be changed.</p>
          <KV obj={detail} />
        </Modal>
      )}

      {modal?.kind === 'open' && (
        <FormModal title="Start a legal hold"
          intro="A hold covers ONE conversation. The case number is required — a court order, ticket, or legal request id. It cannot be changed later. The app will ask for your password again (step-up)."
          fields={[
            { name: 'conversationId', label: 'Conversation id *', required: true },
            { name: 'reason', label: 'Case number * (for example: Court order ER-2026-0412)', type: 'textarea', required: true },
          ]}
          submitLabel="Start the hold"
          onSubmit={async (v) => { await LegalHoldsApi.open(v.conversationId, v.reason); done('Hold started. Now a DIFFERENT admin must approve it.') }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'approve' && (
        <FormModal title="Approve this hold (you are the second admin)"
          intro="Two-person rule: the admin who started a hold can never approve it — the app returns an error if you try. Your approval unlocks a one-time release of the messages. The app will ask for your password again (step-up)."
          fields={[{ name: 'note', label: 'Note, if you want (up to 500 letters)', type: 'textarea' }]}
          submitLabel="Approve the hold"
          onSubmit={async (v) => { await LegalHoldsApi.approve(modal.r.id, v.note); done('Hold approved. The release button is now unlocked.') }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'reject' && (
        <FormModal title="Reject this hold"
          intro="The hold is closed and no messages are ever released for it. The app will ask for your password again (step-up)."
          fields={[{ name: 'note', label: 'Why are you rejecting it?', type: 'textarea' }]}
          submitLabel="Reject the hold"
          onSubmit={async (v) => { await LegalHoldsApi.reject(modal.r.id, v.note); done('Hold rejected. No messages will be released.') }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'execute' && (
        <FormModal title="Release private messages — one time only" danger requireText="EXECUTE"
          intro="This shows the newest messages of the conversation — at most 500. It works ONE time only. You can never run it again, for any reason. Save the result the way your evidence rules say. This is the most serious button in this dashboard. The app will ask for your password again (step-up)."
          fields={[]}
          submitLabel="Release the messages"
          onSubmit={async () => {
            const r = await LegalHoldsApi.execute(modal.r.id)
            setRelease(r); done('Messages released. The hold is now EXECUTED and cannot run again.')
          }}
          onClose={() => setModal(null)} />
      )}

      {release && (
        <Modal title={`Released messages — hold ${release.holdId}`} onClose={() => setRelease(null)} wide>
          {release.warning && <Warn>{release.warning}</Warn>}
          <p>
            <strong>{release.messageCount}</strong> message(s){release.capped ? ' — the 500-message limit was hit, older messages are not included' : ''} · case: {release.reason}
          </p>
          <button className="small secondary"
            onClick={() => saveBlob(new Blob([JSON.stringify(release, null, 2)], { type: 'application/json' }), `legal-hold-${release.holdId}.json`)}>
            Save as a file (JSON)
          </button>
          <DataTable
            columns={[
              { key: 'createdAt', label: 'When sent' },
              { key: 'senderId', label: 'Who sent it', render: (r) => <Id v={r.senderId} /> },
              { key: 'type', label: 'Kind' },
              { key: 'body', label: 'Message text', render: (r) => r.deleted ? <em className="muted">(the sender deleted this message)</em> : r.body },
              { key: 'mediaCount', label: 'Photo/video files' },
            ]}
            rows={release.messages || []}
            rowKey={(r) => String(r.messageId)}
            empty="The conversation has no messages."
          />
          <h3>Full raw record</h3>
          <JsonBlock v={release} />
        </Modal>
      )}
    </div>
  )
}
