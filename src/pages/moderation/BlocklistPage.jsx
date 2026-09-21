import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ContentApi } from '../../api'
import { useLoad, useAction } from '../../util'
import { DataTable, Err, Ok, Note, Warn, Badge, Confirm, PageIntro, HowTo } from '../../components/ui'
import FormModal from '../../components/FormModal'

const SEVERITIES = [
  { value: 'FLAG', label: 'FLAG — let it post, but report it to us' },
  { value: 'BLOCK', label: 'BLOCK — stop the post completely' },
]

export default function BlocklistPage() {
  const { data, err, loading, reload } = useLoad(() => ContentApi.blocklist(), [])
  const act = useAction()
  const [addOpen, setAddOpen] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [delRow, setDelRow] = useState(null)
  const [testText, setTestText] = useState('')
  const [testResult, setTestResult] = useState(null)

  return (
    <div>
      <PageIntro
        title="Blocked words"
        lead="Manage the list of words the app blocks or flags in new posts."
        bullets={[
          'You can add a word or phrase to the list.',
          'You can pick how strong it is: BLOCK stops the post; FLAG lets it post but reports it.',
          'You can test some text to see which words would match.',
          'You can change how strong a word is, or remove it from the list.',
        ]}
      />
      <HowTo steps={[
        'Click "Add a word" and type the word or phrase.',
        'Pick FLAG to just get a report, or BLOCK to stop the post for everyone.',
        'Before you add a BLOCK word, paste sample text in the "Test some text" box below. The match is loose — parts of longer words match too.',
        'To change how strong a word is, click "Change". To take it off the list, click "Remove".',
        'Flagged posts show up on the Reported content page.',
      ]} />
      <Warn>
        BLOCK is a strong tool: it stops <strong>every user on the platform</strong> from posting
        that word. Always test first. Changes can take up to 1 minute to start working.
      </Warn>
      <Note>
        Matching is smart about spelling: it also catches Arabic and Kurdish letter variants.
        Matched posts with a FLAG word go to <Link to="/moderation">Reported content</Link>.
      </Note>
      <div className="toolbar">
        <button title="POST /api/v1/admin/content/blocklist" onClick={() => setAddOpen(true)}>+ Add a word</button>
        <button className="secondary" onClick={reload}>Refresh the list</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'keywordDisplay', label: 'Word' },
          { key: 'keywordNormalized', label: 'Matched as', render: (r) => <code>{r.keywordNormalized}</code> },
          { key: 'severity', label: 'How strong', render: (r) => <Badge kind={r.severity === 'BLOCK' ? 'err' : 'blue'}>{r.severity}</Badge> },
          { key: 'note', label: 'Note' },
          { key: 'createdAt', label: 'When added' },
          {
            key: '_', label: '', render: (r) => (
              <span className="row-actions">
                <button className="small secondary" onClick={() => setEditRow(r)}>Change</button>
                <button className="small danger" onClick={() => setDelRow(r)}>Remove</button>
              </span>
            )
          },
        ]}
        rows={data || []}
        loading={loading}
        empty="The list is empty. No words are blocked or flagged yet."
      />

      <div className="card">
        <h2>Test some text (safe — changes nothing)</h2>
        <Note>Paste sample text to see which listed words would match it. Nothing is posted or saved.</Note>
        <textarea value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="Paste sample text here, then click the button…" />
        <div className="row mt-2">
          <button title="POST /api/v1/admin/content/blocklist/test" disabled={!testText || act.busy} onClick={async () => {
            const r = await act.run(() => ContentApi.blocklistTest(testText))
            if (r) setTestResult(r)
          }}>Test this text</button>
        </div>
        {testResult && (
          testResult.matched
            ? <div className="banner error">These words match: {testResult.matches.join(' · ')}</div>
            : <div className="banner ok">No blocked words match this text.</div>
        )}
      </div>

      {addOpen && (
        <FormModal title="Add a blocked word"
          intro="FLAG = the post still goes out, but it shows up on Reported content. BLOCK = the post is stopped for everyone on the platform. If the word is already on the list, this updates it instead. You will be asked for your password again (step-up)."
          fields={[
            { name: 'keyword', label: 'Word or phrase *', required: true },
            { name: 'severity', label: 'How strong', type: 'select', options: SEVERITIES, value: 'FLAG', required: true },
            { name: 'note', label: 'Note — why this word? (max 200 letters)' },
          ]}
          submitLabel="Add this word"
          onSubmit={async (v) => { await ContentApi.blocklistAdd(v); act.setOk('The word is on the list. It starts working within 1 minute.'); reload() }}
          onClose={() => setAddOpen(false)} />
      )}
      {editRow && (
        <FormModal title={`Change "${editRow.keywordDisplay}"`}
          intro="You cannot change the word itself — remove it and add the new word instead. A field you leave alone keeps its current value."
          fields={[
            { name: 'severity', label: 'How strong', type: 'select', options: SEVERITIES, value: editRow.severity },
            { name: 'note', label: 'Note', value: editRow.note || '' },
          ]}
          submitLabel="Save changes"
          onSubmit={async (v) => { await ContentApi.blocklistUpdate(editRow.id, v); act.setOk('Saved. The change starts working within 1 minute.'); reload() }}
          onClose={() => setEditRow(null)} />
      )}
      {delRow && (
        <Confirm
          title="Remove this word from the list?"
          message={`This takes "${delRow.keywordDisplay}" off the list. New posts with this word will no longer be blocked or reported.`}
          confirmLabel="Remove this word"
          busy={act.busy}
          onConfirm={async () => { await act.run(() => ContentApi.blocklistDelete(delRow.id), 'The word is off the list.'); setDelRow(null); reload() }}
          onClose={() => setDelRow(null)}
        />
      )}
    </div>
  )
}
