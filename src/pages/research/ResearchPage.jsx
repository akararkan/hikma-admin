import React, { useState } from 'react'
import { ResearchApi } from '../../api'
import { useLoad, useAction, pageRows, useDebounced } from '../../util'
import { DataTable, Pager, Err, Ok, Note, Warn, Field, Select, Tabs, StatusBadge, KV, Modal, PageIntro, HowTo, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'

const STATUSES = [
  { value: 'DRAFT', label: 'Not published yet (DRAFT)' },
  { value: 'PUBLISHED', label: 'Published (PUBLISHED)' },
  { value: 'ARCHIVED', label: 'Put away (ARCHIVED)' },
  { value: 'RETRACTED', label: 'Withdrawn (RETRACTED)' },
]

export default function ResearchPage() {
  const [tab, setTab] = useState('browse')
  return (
    <div>
      <PageIntro
        title="Research papers"
        lead="Check the research papers on the platform and fix problems."
        bullets={[
          'You can search all papers and open one to see its details.',
          'You can see which papers get the most downloads or citations.',
          'You can hide, withdraw, or delete a paper that breaks the rules.',
          'You can mark a paper that looks copied or low quality (flag).',
          'You can close problem flags after you check them.',
        ]}
      />
      <HowTo steps={[
        'Pick a tab: "All papers", "Most downloaded", or "Problem flags".',
        'Use the boxes at the top to filter the list.',
        'Click "See details" on a row to read more about one paper.',
        'Click "Flag a problem" on a row to mark a paper that looks wrong.',
        'To hide, withdraw, or delete a paper, open "See details" first. The buttons are inside.',
        'Danger actions ask for your password again (step-up). This is normal.',
      ]} />
      <Tabs tabs={[
        { id: 'browse', label: 'All papers' },
        { id: 'top', label: 'Most downloaded' },
        { id: 'flags', label: 'Problem flags' },
      ]} active={tab} onChange={setTab} />
      {tab === 'browse' && <Browse />}
      {tab === 'top' && <Top />}
      {tab === 'flags' && <Flags />}
    </div>
  )
}

function ResearchTable({ data, loading, page, setPage, onInspect, onAction }) {
  return (
    <>
      <DataTable
        columns={[
          { key: 'title', label: 'Title', render: (r) => <strong>{r.title}</strong> },
          { key: 'ircId', label: 'Paper number (IRC id)', render: (r) => <code>{r.ircId}</code> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'visibility', label: 'Who can see it' },
          { key: 'researcherUsername', label: 'Written by' },
          { key: 'viewCount', label: 'Views' }, { key: 'downloadCount', label: 'Downloads' }, { key: 'citationCount', label: 'Cited by others' },
          { key: 'publishedAt', label: 'Published on' },
          {
            // The moderation buttons (hide / withdraw / delete) live inside the
            // details modal; the row keeps only the two most-used actions.
            key: '_', label: 'What you can do', render: (r) => (
              <span className="row-actions">
                <button className="small secondary" title="GET /api/v1/admin/research/{id}" onClick={() => onInspect(r.id)}>See details</button>
                <button className="small secondary" title="POST /api/v1/admin/research/{id}/flags" onClick={() => onAction('flag', r)}>Flag a problem</button>
              </span>
            )
          },
        ]}
        rows={pageRows(data)}
        loading={loading}
        empty="No papers match. Try different filters."
      />
      <Pager data={data} page={page} onPage={setPage} />
    </>
  )
}

function Browse() {
  const [f, setF] = useState({ status: undefined, researcherId: '', ircId: '', q: '' })
  // Debounced: the text boxes fire a fetch once typing pauses, not per keystroke.
  const df = useDebounced(f, 300)
  const [page, setPage] = useState(0)
  const { data, err, loading, reload } = useLoad(
    () => ResearchApi.list({ ...df, researcherId: df.researcherId || undefined, ircId: df.ircId || undefined, q: df.q || undefined, page, size: 25 }),
    [JSON.stringify(df), page]
  )
  // A narrower filter has fewer pages — always jump back to page 0 so the user
  // never lands on a phantom empty page with no way back.
  const setFilter = (patch) => { setF((s) => ({ ...s, ...patch })); setPage(0) }
  return <BrowseShell err={err} loading={loading} data={data} page={page} setPage={setPage} reload={reload}
    filters={
      <div className="filters">
        <Field label="Status"><Select value={f.status} onChange={(v) => setFilter({ status: v })} options={STATUSES} emptyLabel="(all)" /></Field>
        <Field label="Writer's user id"><input className="w-id" value={f.researcherId} onChange={(e) => setFilter({ researcherId: e.target.value })} /></Field>
        <Field label="Paper number (IRC id)"><input value={f.ircId} onChange={(e) => setFilter({ ircId: e.target.value })} placeholder="IRC-2026-000042" /></Field>
        <Field label="Title has these words"><input value={f.q} onChange={(e) => setFilter({ q: e.target.value })} /></Field>
        <button className="secondary" onClick={reload}>Refresh the list</button>
      </div>
    } />
}

function Top() {
  const [by, setBy] = useState('downloads')
  const [page, setPage] = useState(0)
  const { data, err, loading, reload } = useLoad(() => ResearchApi.top({ by, page, size: 25 }), [by, page])
  return <BrowseShell err={err} loading={loading} data={data} page={page} setPage={setPage} reload={reload}
    filters={
      <div className="filters">
        <Field label="Order by"><Select value={by} onChange={(v) => { setBy(v || 'downloads'); setPage(0) }} options={[
          { value: 'downloads', label: 'Most downloads first' },
          { value: 'citations', label: 'Most citations first' },
        ]} allowEmpty={false} /></Field>
        <Note>This list shows published papers only.</Note>
      </div>
    } />
}

function BrowseShell({ filters, err, loading, data, page, setPage, reload }) {
  const act = useAction()
  const [inspect, setInspect] = useState(null)
  const [downloads, setDownloads] = useState(null)
  const [modal, setModal] = useState(null)

  const onInspect = async (id) => {
    // Plain read: don't route it through act.run twice — a second run would wipe the
    // first call's error and flash a false "Done." banner.
    act.clear()
    try {
      const d = await ResearchApi.detail(id)
      setInspect({ id, d })
    } catch (e) { act.setErr(e); return }
    try { setDownloads(await ResearchApi.downloads(id, 50)) } catch { setDownloads([]) }
  }
  const onAction = (kind, r) => setModal({ kind, r })
  const done = (msg) => { act.setOk(msg); reload() }

  return (
    <div>
      {filters}
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <ResearchTable data={data} loading={loading} page={page} setPage={setPage} onInspect={onInspect} onAction={onAction} />
      {inspect && (
        <Modal title="Paper details" onClose={() => { setInspect(null); setDownloads(null) }} wide>
          <KV obj={{
            'Title': inspect.d.research?.title,
            'Paper number (IRC id)': inspect.d.research?.ircId,
            'Status': inspect.d.research?.status,
            'Who can see it': inspect.d.research?.visibility,
            'Written by': inspect.d.research?.researcherUsername,
            "Writer's user id": inspect.d.research?.researcherId,
            'Views': inspect.d.research?.viewCount,
            'Downloads': inspect.d.research?.downloadCount,
            'Reactions': inspect.d.research?.reactionCount,
            'Comments': inspect.d.research?.commentCount,
            'Cited by others': inspect.d.research?.citationCount,
            'Published on': inspect.d.research?.publishedAt,
            'Created on': inspect.d.research?.createdAt,
          }} />
          <h3>What you can do</h3>
          <div className="row">
            {inspect.d.research?.status === 'PUBLISHED' && <button className="small secondary" title="POST /api/v1/admin/research/{id}/unpublish" onClick={() => { setInspect(null); setDownloads(null); onAction('unpublish', { id: inspect.id, title: inspect.d.research?.title }) }}>Hide it (unpublish)</button>}
            {inspect.d.research?.status === 'PUBLISHED' && <button className="small danger" title="POST /api/v1/admin/research/{id}/retract" onClick={() => { setInspect(null); setDownloads(null); onAction('retract', { id: inspect.id, title: inspect.d.research?.title }) }}>Withdraw it (retract)</button>}
            <button className="small danger" title="DELETE /api/v1/admin/research/{id}" onClick={() => { setInspect(null); setDownloads(null); onAction('delete', { id: inspect.id, title: inspect.d.research?.title }) }}>Delete forever</button>
          </div>
          <h3>Short summary (abstract)</h3>
          {(!inspect.d.abstractText || inspect.d.abstractText === 'null')
            ? <div className="muted">This paper has no summary.</div>
            : <p>{inspect.d.abstractText}</p>}
          <h3>More numbers</h3>
          <KV obj={{
            'Times saved': inspect.d.saveCount,
            'Times shared': inspect.d.shareCount,
            'Comments allowed': inspect.d.commentsEnabled,
            'Downloads allowed': inspect.d.downloadsEnabled,
          }} />
          <h3>Problem flags on this paper</h3>
          <DataTable columns={[
            { key: 'createdAt', label: 'When flagged' },
            { key: 'type', label: 'Problem type', render: (r) => <code>{r.type}</code> },
            { key: 'note', label: 'Note' },
            { key: 'resolvedAt', label: 'Closed on' },
            { key: 'resolutionNote', label: 'Closing note' },
          ]} rows={inspect.d.flags || []} empty="No flags on this paper." />
          <h3>Who downloaded it (last 50)</h3>
          <Warn>This list shows IP addresses. IP addresses are private details. Do not share them.</Warn>
          <DataTable columns={[
            { key: 'createdAt', label: 'When' }, { key: 'userId', label: 'User id', render: (r) => <Id v={r.userId} /> },
            { key: 'mediaId', label: 'File id', render: (r) => <Id v={r.mediaId} /> }, { key: 'ipAddress', label: 'IP address' },
          ]} rows={downloads || []} loading={!downloads} empty="No downloads yet." />
        </Modal>
      )}
      {modal?.kind === 'unpublish' && (
        <FormModal title={`Hide "${modal.r.title}"`} danger
          intro="This takes the paper off the app and back to a draft. It leaves search and trending. The writer gets a message. You will be asked for your password again (step-up)."
          fields={[{ name: 'reason', label: 'Why are you hiding it? (up to 500 letters)', type: 'textarea' }]}
          submitLabel="Hide this paper"
          onSubmit={async (v) => { await ResearchApi.unpublish(modal.r.id, v.reason); done('The paper is hidden. It is a draft again.') }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'retract' && (
        <FormModal title={`Withdraw "${modal.r.title}"`} danger requireText="RETRACT"
          intro="This marks the paper as withdrawn (RETRACTED). This is a permanent mark on the scholarly record. You cannot undo it. The writer gets a message. You will be asked for your password again (step-up)."
          fields={[{ name: 'reason', label: 'Why are you withdrawing it? (up to 500 letters)', type: 'textarea' }]}
          submitLabel="Withdraw this paper"
          onSubmit={async (v) => { await ResearchApi.retract(modal.r.id, v.reason); done('The paper is marked as withdrawn.') }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'delete' && (
        <FormModal title={`Delete "${modal.r.title}" forever`} danger requireText="DELETE"
          intro="This deletes the paper and all its files, comments, and numbers for everyone. You cannot undo it. The writer gets a message. You will be asked for your password again (step-up)."
          fields={[{ name: 'reason', label: 'Why are you deleting it? (up to 500 letters)', type: 'textarea' }]}
          submitLabel="Delete forever"
          onSubmit={async (v) => { await ResearchApi.remove(modal.r.id, v.reason); done('The paper is deleted.') }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'flag' && (
        <FormModal title={`Flag "${modal.r.title}"`}
          intro="This adds the paper to the problem list so someone can check it. The paper itself does not change."
          fields={[
            { name: 'type', label: 'Problem type *', type: 'select', options: [
              { value: 'PLAGIARISM', label: 'Copied work (PLAGIARISM)' },
              { value: 'QUALITY', label: 'Low quality (QUALITY)' },
            ], required: true },
            { name: 'note', label: 'Note (up to 500 letters)', type: 'textarea' },
          ]}
          submitLabel="Add the flag"
          onSubmit={async (v) => { await ResearchApi.flag(modal.r.id, v); done('The flag is added. It is now in the problem list.') }}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function Flags() {
  const [page, setPage] = useState(0)
  const { data, err, loading, reload } = useLoad(() => ResearchApi.flags({ page, size: 25 }), [page])
  const act = useAction()
  const [resolve, setResolve] = useState(null)
  return (
    <div>
      <Note>These are open problem reports about papers (copied work or low quality). The oldest ones come first — check those first.</Note>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'createdAt', label: 'When flagged' },
          { key: 'type', label: 'Problem type', render: (r) => <code>{r.type}</code> },
          { key: 'researchId', label: 'Paper id', render: (r) => <Id v={r.researchId} /> },
          { key: 'note', label: 'Note' },
          { key: 'flaggedBy', label: 'Flagged by', render: (r) => <Id v={r.flaggedBy} /> },
          { key: '_', label: '', render: (r) => !r.resolvedAt && <button className="small" title="POST /api/v1/admin/research/flags/{flagId}/resolve" onClick={() => setResolve(r)}>Close this flag</button> },
        ]}
        rows={pageRows(data)}
        loading={loading}
        empty="No flags are open. Nothing to do here right now."
      />
      <Pager data={data} page={page} onPage={setPage} />
      {resolve && (
        <FormModal title="Close this flag"
          intro="Closing a flag means you checked it. Write what you found and what you did."
          fields={[{ name: 'reason', label: 'What did you decide? (note)', type: 'textarea' }]}
          submitLabel="Close the flag"
          onSubmit={async (v) => { await ResearchApi.resolveFlag(resolve.id, v.reason); act.setOk('The flag is closed.'); reload() }}
          onClose={() => setResolve(null)} />
      )}
    </div>
  )
}
