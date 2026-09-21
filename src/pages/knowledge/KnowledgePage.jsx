import React, { useState } from 'react'
import { KnowledgeApi } from '../../api'
import { useLoad, useAction } from '../../util'
import { DataTable, Err, Ok, Note, Badge, PageIntro, HowTo, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'

export default function KnowledgePage() {
  const act = useAction()
  return (
    <div>
      <PageIntro
        title="Topic names"
        lead="Edit the two fixed name lists users pick from on their profile: topics (fields of knowledge) and madhhabs (schools of law)."
        bullets={[
          'You can add a new topic or madhhab in three languages.',
          'You can fix a name in English, Arabic, or Kurdish.',
          'You can retire an item so users cannot pick it any more.',
          'You can clear the saved copy (cache) if the app still shows old names.',
        ]}
      />
      <HowTo steps={[
        'Find the item in the Topics table or the Madhhabs table.',
        'Click "Edit" to fix a name. Leave a box empty to keep the old name.',
        'Click "Retire" to hide an item from the pickers. Users who already picked it keep it.',
        'Click "+ Add" to create a new item. You must write all three names.',
        'Every save asks for your password again (step-up). This is normal.',
      ]} />
      <Note>These names are part of how scholars describe themselves, so changes show across the whole app. Every save clears the saved copy (cache) by itself — the button below is only for emergencies.</Note>
      <div className="toolbar">
        <button className="secondary" title="POST /api/v1/admin/knowledge/cache/evict" disabled={act.busy} onClick={() => act.run(() => KnowledgeApi.evictCache(), 'The saved copy is cleared. The app will load fresh names.')}>Clear the saved copy (cache)</button>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      <VocabTable kind="topic" title="Topics (fields of knowledge)" fetcher={KnowledgeApi.topics} add={KnowledgeApi.addTopic} edit={KnowledgeApi.editTopic} retire={KnowledgeApi.retireTopic} />
      <VocabTable kind="madhhab" title="Madhhabs (schools of law)" fetcher={KnowledgeApi.madhhabs} add={KnowledgeApi.addMadhhab} edit={KnowledgeApi.editMadhhab} retire={KnowledgeApi.retireMadhhab} />
    </div>
  )
}

function VocabTable({ kind, title, fetcher, add, edit, retire }) {
  const { data, err, loading, reload } = useLoad(() => fetcher(), [])
  const act = useAction()
  const [addOpen, setAddOpen] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [retireRow, setRetireRow] = useState(null)
  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <button className="small card-head-action" onClick={() => setAddOpen(true)}>+ Add a {kind}</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'id', label: 'Id', render: (r) => <Id v={r.id} /> },
          { key: 'nameEn', label: 'English name' },
          { key: 'nameAr', label: 'Arabic name (العربية)' },
          { key: 'nameCkb', label: 'Kurdish name (کوردی)' },
          { key: 'usageCount', label: 'Profiles using it' },
          { key: 'retired', label: 'In use?', render: (r) => (r.retired || r.archivedAt) ? <Badge kind="err">retired</Badge> : <Badge kind="green">in use</Badge> },
          {
            key: '_', label: '', render: (r) => (
              <span className="row-actions">
                <button className="small secondary" onClick={() => setEditRow(r)}>Edit</button>
                {!(r.retired || r.archivedAt) && <button className="small danger" onClick={() => setRetireRow(r)}>Retire</button>}
              </span>
            )
          },
        ]}
        rows={data || []}
        loading={loading}
        empty={`No ${kind}s yet.`}
      />
      {addOpen && (
        <FormModal title={`Add a ${kind}`}
          intro="Write the name in all three languages. The English name must be new — the same name cannot exist twice."
          fields={[
            { name: 'nameEn', label: 'English name *', required: true },
            { name: 'nameAr', label: 'Arabic name *', required: true },
            { name: 'nameCkb', label: 'Central Kurdish name *', required: true },
          ]}
          submitLabel="Add it"
          onSubmit={async (v) => { await add(v); act.setOk('Added. Users can pick it now.'); reload() }}
          onClose={() => setAddOpen(false)} />
      )}
      {editRow && (
        <FormModal title={`Edit "${editRow.nameEn}"`}
          intro="Change only the names you want to fix. Leave a box empty to keep the old name — empty does not erase."
          fields={[
            { name: 'nameEn', label: 'English name', value: editRow.nameEn },
            { name: 'nameAr', label: 'Arabic name', value: editRow.nameAr },
            { name: 'nameCkb', label: 'Central Kurdish name', value: editRow.nameCkb },
          ]}
          submitLabel="Save changes"
          onSubmit={async (v) => { await edit(editRow.id, v); act.setOk('Saved. The new names show across the app.'); reload() }}
          onClose={() => setEditRow(null)} />
      )}
      {retireRow && (
        <FormModal title={`Retire "${retireRow.nameEn}"`} danger requireText="RETIRE"
          intro={`This hides "${retireRow.nameEn}" so users cannot pick it any more. ${retireRow.usageCount ?? '?'} profile(s) use it today — they keep it, nothing breaks for them. There is no un-retire button, so be sure.`}
          fields={[]}
          submitLabel="Retire it"
          onSubmit={async () => { await retire(retireRow.id); act.setOk('Retired. It is gone from the pickers.'); reload() }}
          onClose={() => setRetireRow(null)} />
      )}
    </div>
  )
}
