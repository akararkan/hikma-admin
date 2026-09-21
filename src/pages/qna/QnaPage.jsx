import React, { useState } from 'react'
import { QnaApi } from '../../api'
import { useLoad, useAction, pageRows, useDebounced } from '../../util'
import { DataTable, Pager, Err, Ok, Note, Field, Select, StatusBadge, PageIntro, HowTo } from '../../components/ui'
import FormModal from '../../components/FormModal'

const Q_STATUSES = [
  { value: 'OPEN', label: 'Waiting for answers (OPEN)' },
  { value: 'ANSWERED', label: 'Has answers (ANSWERED)' },
  { value: 'CLOSED', label: 'Closed — no new answers (CLOSED)' },
  { value: 'ARCHIVED', label: 'Put away (ARCHIVED)' },
]

export default function QnaPage() {
  const [f, setF] = useState({ status: undefined, authorId: '', q: '', unanswered: undefined, lockedOnly: undefined })
  // Debounced: the text boxes fire a fetch once typing pauses, not per keystroke.
  const df = useDebounced(f, 300)
  const [page, setPage] = useState(0)
  const { data, err, loading, reload } = useLoad(
    () => QnaApi.questions({ ...df, authorId: df.authorId || undefined, q: df.q || undefined, page, size: 25 }),
    [JSON.stringify(df), page]
  )
  const act = useAction()
  const [modal, setModal] = useState(null)
  const done = (msg) => { act.setOk(msg); reload() }
  // A narrower filter has fewer pages — always jump back to page 0 so the user
  // never lands on a phantom empty page with no way back.
  const setFilter = (patch) => { setF((s) => ({ ...s, ...patch })); setPage(0) }

  return (
    <div>
      <PageIntro
        title="Questions & answers"
        lead="Look after the questions scholars ask and the answers they give."
        bullets={[
          'You can search and filter all questions.',
          'You can close a question so it gets no new answers.',
          'You can open a closed question again.',
          'You can move an old question to the archive.',
          'You can delete a bad question or one bad answer.',
        ]}
      />
      <HowTo steps={[
        'Use the boxes at the top to find questions. For example, pick "No answers yet" to see the backlog.',
        'Click "Close" on a question to stop new answers. Say why.',
        'Click "Open again" if a closed question should take answers again.',
        'Click "Move to archive" to put an old question away.',
        '"Delete forever" removes the question and all its answers. You cannot undo it.',
        'To delete one answer only, use the box at the bottom of the page.',
      ]} />
      <Note>There are no ratings or votes on answers. That is on purpose. The question writer marks one answer as accepted — that is the only quality signal. Also note: only admins can change or delete here. Moderators can look, but saves will fail for them.</Note>
      <div className="filters">
        <Field label="Status"><Select value={f.status} onChange={(v) => setFilter({ status: v })} options={Q_STATUSES} emptyLabel="(all)" /></Field>
        <Field label="Writer's user id"><input className="w-id" value={f.authorId} onChange={(e) => setFilter({ authorId: e.target.value })} /></Field>
        <Field label="Title has these words"><input value={f.q} onChange={(e) => setFilter({ q: e.target.value })} /></Field>
        <Field label="Answers"><Select value={f.unanswered} onChange={(v) => setFilter({ unanswered: v })} options={[{ value: 'true', label: 'No answers yet' }, { value: 'false', label: 'Has answers' }]} emptyLabel="(all)" /></Field>
        <Field label="Locked"><Select value={f.lockedOnly} onChange={(v) => setFilter({ lockedOnly: v })} options={[{ value: 'true', label: 'Locked only' }, { value: 'false', label: 'Not locked only' }]} emptyLabel="(all)" /></Field>
        <button className="secondary" onClick={reload}>Refresh the list</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'title', label: 'Question', render: (r) => <strong>{r.title}</strong> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'authorUsername', label: 'Who asked it' },
          { key: 'answerCount', label: 'Answers' },
          { key: 'acceptedAnswerCount', label: 'Accepted' },
          { key: 'answersLocked', label: 'Locked' },
          { key: 'viewCount', label: 'Views' },
          { key: 'createdAt', label: 'When asked' },
          {
            key: '_', label: 'What you can do', render: (r) => (
              <span className="row-actions">
                {['OPEN', 'ANSWERED'].includes(r.status) && <button className="small secondary" title="POST /api/v1/admin/qna/questions/{id}/close" onClick={() => setModal({ kind: 'close', r })}>Close</button>}
                {['CLOSED', 'ARCHIVED'].includes(r.status) && <button className="small" title="POST /api/v1/admin/qna/questions/{id}/reopen" onClick={async () => { await act.run(() => QnaApi.reopen(r.id), 'The question is open again.'); reload() }}>Open again</button>}
                {r.status !== 'ARCHIVED' && <button className="small secondary" title="POST /api/v1/admin/qna/questions/{id}/archive" onClick={async () => { await act.run(() => QnaApi.archive(r.id), 'The question is in the archive now.'); reload() }}>Move to archive</button>}
                <button className="small danger" title="DELETE /api/v1/admin/qna/questions/{id}" onClick={() => setModal({ kind: 'delete', r })}>Delete forever</button>
              </span>
            )
          },
        ]}
        rows={pageRows(data)}
        loading={loading}
        empty="No questions match. Try different filters."
      />
      <Pager data={data} page={page} onPage={setPage} />

      <div className="card">
        <h2>Delete one answer</h2>
        <Note>This removes one answer only, not the question. Its reactions are removed too. If it was the accepted answer, that mark is taken away.</Note>
        <button className="danger" title="DELETE /api/v1/admin/qna/answers/{answerId}" onClick={() => setModal({ kind: 'deleteAnswer' })}>Delete an answer…</button>
      </div>

      {modal?.kind === 'close' && (
        <FormModal title={`Close "${modal.r.title}"`}
          intro="A closed question gets no new answers. The reason is saved in the action history."
          fields={[{ name: 'reason', label: 'Why are you closing it?', type: 'textarea' }]}
          submitLabel="Close this question"
          onSubmit={async (v) => { await QnaApi.close(modal.r.id, v.reason); done('The question is closed.') }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'delete' && (
        <FormModal title={`Delete "${modal.r.title}" forever`} danger requireText="DELETE"
          intro="This deletes the question, all its answers, and all its files for everyone. You cannot undo it. You will be asked for your password again (step-up)."
          fields={[{ name: 'reason', label: 'Why are you deleting it?', type: 'textarea' }]}
          submitLabel="Delete forever"
          onSubmit={async (v) => { await QnaApi.deleteQuestion(modal.r.id, v.reason); done('The question is deleted.') }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'deleteAnswer' && (
        <FormModal title="Delete one answer" danger requireText="DELETE"
          intro="This removes the answer for everyone. You cannot undo it. You will be asked for your password again (step-up)."
          fields={[
            { name: 'answerId', label: 'Answer id *', required: true, help: 'Paste the id of the answer you want to remove.' },
            { name: 'reason', label: 'Why are you deleting it?', type: 'textarea' },
          ]}
          submitLabel="Delete this answer"
          onSubmit={async (v) => { await QnaApi.deleteAnswer(v.answerId, v.reason); done('The answer is deleted.') }}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}
