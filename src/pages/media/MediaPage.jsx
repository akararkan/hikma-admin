import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { MediaApi } from '../../api'
import { useLoad, useAction, pageRows, fmtBytes, useDebounced } from '../../util'
import { DataTable, Pager, Err, Ok, Note, Warn, Loading, Field, Select, Tabs, Tiles, KV, Modal, JsonBlock, StatusBadge, PageIntro, HowTo, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'
import { STATUS_LABELS, STATUS_OPTIONS, TYPE_LABELS, TYPE_OPTIONS, ROLES } from './labels'

/**
 * Media timestamps are `LocalDateTime` with no zone ("2026-08-06T09:15:00") — unlike sound
 * `Instant`s. The generic date cell parses them as browser-local, converts to UTC and stamps a
 * "Z", so the shown time is off by the viewer's offset and mislabelled. Render them as sent.
 */
const fmtLdt = (v) => (v == null ? '' : String(v).replace('T', ' '))

// Only failed uploads (and stuck "working on it" ones) can be retried — the server
// answers ASSET_NOT_RETRYABLE for anything else, so we hide the button instead.
const canRetry = (s) => s === 'PROCESSING' || String(s || '').startsWith('FAILED')

export default function MediaPage() {
  const [tab, setTab] = useState('board')
  return (
    <div>
      <PageIntro
        title="Uploads"
        lead="Watch photo, video, and sound uploads move through the system. Fix the ones that fail."
        bullets={[
          'You can see how many uploads are waiting, working, done, or failed.',
          'You can find any upload and look inside it.',
          'You can retry a failed upload, or delete one for everyone.',
          'You can run clean-up jobs, with a safe test first.',
          'You can set daily upload limits for each role.',
        ]}
      />
      <HowTo steps={[
        'Open "Status board" to see the health numbers.',
        'Open "Failed uploads" to see what needs fixing.',
        'Click "Look inside" on a row to see all its details.',
        'Click "Try again" to retry a failed upload.',
        'Use "Clean-up runs" to free storage space. Always run the safe test first.',
      ]} />
      <Tabs tabs={[
        { id: 'board', label: 'Status board' },
        { id: 'failed', label: 'Failed uploads' },
        { id: 'browse', label: 'All uploads' },
        { id: 'sweeps', label: 'Clean-up runs' },
        { id: 'quotas', label: 'Daily limits (quotas)' },
      ]} active={tab} onChange={setTab} />
      {tab === 'board' && <Board />}
      {tab === 'failed' && <FailedQueues />}
      {tab === 'browse' && <AssetBrowser />}
      {tab === 'sweeps' && <Sweeps />}
      {tab === 'quotas' && <Quotas />}
    </div>
  )
}

function Board() {
  const ops = useLoad(() => MediaApi.ops(), [])
  const d = ops.data
  return (
    <div>
      <div className="toolbar">
        <button className="secondary" title="GET /api/v1/admin/media/ops" onClick={ops.reload}>Refresh the numbers</button>
      </div>
      <Err e={ops.err} /><Loading on={ops.loading} />
      {d && (
        <>
          <h3>Uploads by status</h3>
          <Tiles items={[
            // UPLOADING is a declared status the pipeline never sets today — hide the empty tile.
            ...Object.entries(d.statusFunnel || {})
              .filter(([k, v]) => !(k === 'UPLOADING' && !v))
              .map(([k, v]) => ({ label: STATUS_LABELS[k] || k, value: v, sub: k })),
          ]} />
          <h3>Things to watch</h3>
          <Tiles items={[
            { label: 'Uploads that never finished (older than 24 hours)', value: d.abandonedPendingOver24h, sub: 'PENDING' },
            { label: 'Old original files ready to delete', value: d.rawPurgeDue, sub: 'use "Clean-up runs"' },
            { label: 'Total space used', value: fmtBytes(d.platformStoredBytes), sub: 'new upload system only' },
          ]} />
          <div className="card">
            <h2>Daily upload limits right now</h2>
            <DataTable
              columns={[
                { key: 'role', label: 'Role' },
                { key: 'dailyUploads', label: 'Files per day' },
                { key: 'dailyBytes', label: 'Data per day', render: (r) => fmtBytes(r.dailyBytes) },
                { key: 'enabled', label: 'Limit is on' },
              ]}
              rows={d.quotas || []}
              loading={ops.loading}
              empty="No limits are set. Everyone can upload without a limit."
            />
            <Note>Change these in the "Daily limits (quotas)" tab.</Note>
          </div>
          <Note>The "Failed: blocked content" list stays empty for now. The automatic content scanner is switched off (AllowAllScanner).</Note>
          <Note>Space numbers count only the new upload system (the Path B pipeline). Old-style uploads — avatars, chat files, post photos — are not counted yet.</Note>
        </>
      )}
    </div>
  )
}

function FailedQueues() {
  const [sub, setSub] = useState('FAILED_VALIDATION')
  return (
    <div>
      <HowTo steps={[
        'Pick a list: bad file, blocked content, system error, or stuck.',
        'Read the error message in the table.',
        'Click "Try again" to run the upload through the system again.',
        'If the file is bad or harmful, click "Delete" to remove it for everyone.',
      ]} />
      <Tabs tabs={[
        { id: 'FAILED_VALIDATION', label: 'Bad file' },
        { id: 'FAILED_MODERATION', label: 'Blocked content' },
        { id: 'FAILED_PROCESSING', label: 'System error' },
        { id: 'PROCESSING', label: 'Stuck in progress' },
      ]} active={sub} onChange={setSub} />
      {sub === 'FAILED_MODERATION' && <Note>This list stays empty for now. The automatic content scanner is switched off (AllowAllScanner).</Note>}
      {sub === 'PROCESSING' && <Note>An upload stuck on "working on it" for more than 30 minutes usually means the worker restarted. "Try again" is safe for these.</Note>}
      <AssetBrowser key={sub} lockedStatus={sub} />
    </div>
  )
}

/** Shared asset table. With `lockedStatus` the status filter is fixed (failed-queue view). */
function AssetBrowser({ lockedStatus }) {
  const [f, setF] = useState({ status: undefined, type: undefined, ownerId: '', from: '', to: '' })
  const [page, setPage] = useState(0)
  // A filter change has to land on page 0 — keeping the old index on a narrower result set
  // silently shows an empty table.
  const set = (k, v) => { setPage(0); setF((s) => ({ ...s, [k]: v })) }
  // Debounced copy of the filters: typing a user id fires one fetch per pause, not per keystroke.
  const df = useDebounced(f, 300)
  const status = lockedStatus || df.status
  const { data, err, loading, reload } = useLoad(
    () => MediaApi.list({ ...df, status, ownerId: df.ownerId || undefined, from: df.from || undefined, to: df.to || undefined, page, size: 25 }),
    [JSON.stringify(df), lockedStatus, page]
  )
  const act = useAction()
  const [detail, setDetail] = useState(null)
  const [deleting, setDeleting] = useState(null)
  return (
    <div>
      <div className="filters">
        {!lockedStatus && (
          <Field label="Status"><Select value={f.status} onChange={(v) => set('status', v)} options={STATUS_OPTIONS} emptyLabel="(all)" /></Field>
        )}
        <Field label="Type"><Select value={f.type} onChange={(v) => set('type', v)} options={TYPE_OPTIONS} emptyLabel="(all)" /></Field>
        <Field label="Who uploaded it (user id)"><input className="w-id" value={f.ownerId} onChange={(e) => set('ownerId', e.target.value)} /></Field>
        <Field label="From"><input type="datetime-local" value={f.from} onChange={(e) => set('from', e.target.value)} /></Field>
        <Field label="To"><input type="datetime-local" value={f.to} onChange={(e) => set('to', e.target.value)} /></Field>
        <button className="secondary" title="GET /api/v1/admin/media" onClick={reload}>Refresh the list</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'createdAt', label: 'When it started', render: (r) => fmtLdt(r.createdAt) || '—' },
          { key: 'type', label: 'Type', render: (r) => <span title={r.type}>{TYPE_LABELS[r.type] || r.type}</span> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'mime', label: 'File type' },
          { key: 'originalBytes', label: 'Original size', render: (r) => fmtBytes(r.originalBytes) },
          { key: 'storedBytes', label: 'Stored size', render: (r) => fmtBytes(r.storedBytes) },
          { key: 'errorMessage', label: 'Error message' },
          { key: 'ownerId', label: 'Who uploaded it', render: (r) => <Link to={`/users/${r.ownerId}`} onClick={(e) => e.stopPropagation()}><Id v={r.ownerId} /></Link> },
          {
            key: '_', label: 'Actions', render: (r) => (
              <span className="row-actions">
                <button className="small secondary" title={`GET /api/v1/admin/media/${r.id}`} onClick={async (e) => { e.stopPropagation(); const d = await act.run(() => MediaApi.detail(r.id), 'Details loaded.'); if (d) setDetail(d) }}>Look inside</button>
                {canRetry(r.status) && (
                  <button className="small secondary" title={`POST /api/v1/admin/media/${r.id}/reprocess`} onClick={async (e) => { e.stopPropagation(); await act.run(() => MediaApi.reprocess(r.id), 'We queued this upload to try again (202). Check its status in a minute.'); reload() }}>Try again</button>
                )}
                <button className="small danger" onClick={(e) => { e.stopPropagation(); setDeleting(r) }}>Delete</button>
              </span>
            )
          },
        ]}
        rows={pageRows(data)}
        loading={loading}
        empty={lockedStatus ? 'No uploads here. Nothing to fix right now.' : 'No uploads match your search.'}
      />
      <Pager data={data} page={page} onPage={setPage} />
      {detail && (
        <Modal title="One upload" onClose={() => setDetail(null)} wide>
          {detail.asset && <KV obj={assetKV(detail.asset)} />}
          <h3>Copies we made (renditions)</h3>
          <DataTable
            columns={[
              { key: 'label', label: 'Name' },
              { key: 'objectKey', label: 'Storage key', render: (r) => <code className="code-xs">{r.objectKey}</code> },
              { key: 'bytes', label: 'Size', render: (r) => fmtBytes(r.bytes) },
              { key: 'width', label: 'Width' }, { key: 'height', label: 'Height' }, { key: 'mime', label: 'File type' },
            ]}
            rows={detail.renditions || []}
            empty="No copies were made yet."
          />
          <KV obj={{ 'Other uploads that share this same file (dedup)': detail.dedupSiblings }} />
        </Modal>
      )}
      {deleting && (
        <FormModal title="Delete this upload for everyone" danger requireText="DELETE"
          intro="This deletes the file and all its copies for everyone. You cannot undo it. If another upload shares the same file, the shared file itself stays. You will get the extra password check (step-up)."
          fields={[{ name: 'reason', label: 'Why are you deleting it? (up to 500 letters)', type: 'textarea' }]}
          submitLabel="Delete forever"
          onSubmit={async (v) => { await MediaApi.remove(deleting.id, v.reason); act.setOk('Delete accepted (202). It may take a moment to finish.'); reload() }}
          onClose={() => setDeleting(null)} />
      )}
    </div>
  )
}

/** Plain-worded key/value view of one asset row. */
function assetKV(a) {
  return {
    'Upload id': a.id,
    'Who uploaded it': a.ownerId,
    'Type': TYPE_LABELS[a.type] ? `${TYPE_LABELS[a.type]} (${a.type})` : a.type,
    'Status': a.status,
    'File type (MIME)': a.mime,
    'Original size': fmtBytes(a.originalBytes),
    'Stored size': fmtBytes(a.storedBytes),
    ...(a.width != null ? { 'Width x height': `${a.width} x ${a.height}` } : {}),
    ...(a.durationMs != null ? { 'Length (milliseconds)': a.durationMs } : {}),
    'Quality asked for (tier)': a.requestedTier,
    ...(a.errorMessage ? { 'Error message': a.errorMessage } : {}),
    'When it started': fmtLdt(a.createdAt),
    'Last change': fmtLdt(a.updatedAt),
    ...(a.purgeOriginalAt ? { 'Original file will be deleted after': fmtLdt(a.purgeOriginalAt) } : {}),
  }
}

function Sweeps() {
  const act = useAction()
  const [purgeDry, setPurgeDry] = useState(true)
  const [purgeResult, setPurgeResult] = useState(null)
  const [rec, setRec] = useState({ prefix: 'media/', dryRun: true, maxObjects: 1000 })
  const [recResult, setRecResult] = useState(null)
  const [confirmWet, setConfirmWet] = useState(null) // 'purge' | 'reconcile'

  const runPurge = async () => {
    const r = await act.run(() => MediaApi.purgeRawRun(purgeDry), purgeDry ? 'Safe test done — nothing was deleted.' : 'Real run done — old original files were deleted.')
    if (r) setPurgeResult(r)
  }
  const runReconcile = async () => {
    const r = await act.run(() => MediaApi.reconcile(rec), rec.dryRun ? 'Safe test done — nothing was deleted.' : 'Real run done — left-over files were deleted.')
    if (r) setRecResult(r)
  }

  return (
    <div>
      <HowTo steps={[
        'Keep "Safe test" ticked and run the job. A safe test changes nothing.',
        'Read the result. It shows what a real run would delete.',
        'If the result looks right, untick "Safe test" and run again.',
        'For a real run you must type DELETE, and you will get the extra password check (step-up).',
      ]} />
      <Err e={act.err} /><Ok msg={act.ok} />
      <div className="card">
        <h2>Delete old original files (raw purge)</h2>
        <Note>When an upload is done, we keep the original file for 7 days, then it can go. This job deletes originals past that date. It also cleans up uploads that started more than 7 days ago but never finished.</Note>
        <div className="filters">
          <Field label="Safe test (changes nothing)"><input type="checkbox" checked={purgeDry} onChange={(e) => setPurgeDry(e.target.checked)} /></Field>
          <button disabled={act.busy} className={purgeDry ? '' : 'danger'} title="POST /api/v1/admin/media/purge-raw/run" onClick={() => purgeDry ? runPurge() : setConfirmWet('purge')}>
            {purgeDry ? 'Run the safe test' : 'Delete old originals now'}
          </button>
        </div>
        {purgeResult && (
          <KV obj={{
            'Was this a safe test?': purgeResult.dryRun ? 'Yes — nothing was deleted' : 'No — this was a real run',
            'Files that can be deleted': purgeResult.candidates,
            'Files deleted': purgeResult.purged,
          }} />
        )}
      </div>
      <div className="card">
        <h2>Find left-over files (bucket check / reconcile)</h2>
        <Note>This compares the files in storage with our records. A file with no record is a left-over item (orphan). The safe test only lists them. A real run deletes them and needs the extra password check (step-up).</Note>
        <div className="filters">
          <Field label="Folder to check (prefix)"><input value={rec.prefix} onChange={(e) => setRec((s) => ({ ...s, prefix: e.target.value }))} /></Field>
          <Field label="Most files to check (up to 10,000)"><input type="number" value={rec.maxObjects} onChange={(e) => setRec((s) => ({ ...s, maxObjects: Number(e.target.value) || 1000 }))} /></Field>
          <Field label="Safe test (changes nothing)"><input type="checkbox" checked={rec.dryRun} onChange={(e) => setRec((s) => ({ ...s, dryRun: e.target.checked }))} /></Field>
          <button disabled={act.busy} className={rec.dryRun ? '' : 'danger'} title="POST /api/v1/admin/media/reconcile" onClick={() => rec.dryRun ? runReconcile() : setConfirmWet('reconcile')}>
            {rec.dryRun ? 'Run the safe test' : 'Delete left-over files now'}
          </button>
        </div>
        {recResult && (
          <>
            {recResult.note && <Note>{recResult.note}</Note>}
            {recResult.listingTruncated && <Warn>We stopped at the "most files to check" limit. There may be more left-over files. Run again with a bigger limit to be sure.</Warn>}
            {Array.isArray(recResult.orphanKeys) && recResult.orphanCount > recResult.orphanKeys.length && (
              <Warn>We found {recResult.orphanCount} left-over files, but the list below only shows the first {recResult.orphanKeys.length}.</Warn>
            )}
            <KV obj={{
              'Folder checked (prefix)': recResult.prefix,
              'Was this a safe test?': recResult.dryRun ? 'Yes — nothing was deleted' : 'No — this was a real run',
              'Files checked': recResult.objectsListed,
              'Left-over files found': recResult.orphanCount,
              'Size of left-over files': fmtBytes(recResult.orphanBytes),
              ...(recResult.deleted != null ? { 'Files deleted': recResult.deleted } : {}),
            }} />
            {Array.isArray(recResult.orphanKeys) && recResult.orphanKeys.length > 0 && (
              <>
                <h3>Left-over files</h3>
                <JsonBlock v={recResult.orphanKeys} />
              </>
            )}
          </>
        )}
      </div>
      {confirmWet && (
        <FormModal title={confirmWet === 'purge' ? 'Really delete old original files?' : 'Really delete left-over files?'} danger requireText="DELETE"
          intro="This deletes files from storage for real. You cannot undo it."
          fields={[]}
          submitLabel="Yes, delete them"
          onSubmit={async () => { confirmWet === 'purge' ? await runPurge() : await runReconcile() }}
          onClose={() => setConfirmWet(null)} />
      )}
    </div>
  )
}

function Quotas() {
  const { data, err, loading, reload } = useLoad(() => MediaApi.quotas(), [])
  const act = useAction()
  const [edit, setEdit] = useState(null)
  return (
    <div className="card">
      <h2>Daily upload limits (quotas)</h2>
      <Note>A limit says how many files, and how much data, one person can upload each day. The limit resets at midnight UTC. A user over the limit sees "quota reached" (429 MEDIA_QUOTA_EXCEEDED). A role with no row here, or with the limit off, has no limit — that is how staff stay unlimited.</Note>
      <HowTo steps={[
        'Click "Set a limit" (or "Change" on a row).',
        'Pick the role and type the numbers.',
        'Leave a box empty to keep its current value.',
        'To remove a limit, turn "Limit is on" off. Then save.',
      ]} />
      <div className="toolbar">
        <button onClick={() => setEdit({ role: 'USER' })}>Set a limit…</button>
        <button className="secondary" title="GET /api/v1/admin/media/quotas" onClick={reload}>Refresh the list</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'role', label: 'Role' },
          { key: 'dailyUploads', label: 'Files per day' },
          { key: 'dailyBytes', label: 'Data per day', render: (r) => fmtBytes(r.dailyBytes) },
          { key: 'enabled', label: 'Limit is on' },
          { key: '_', label: '', render: (r) => <button className="small secondary" onClick={() => setEdit(r)}>Change</button> },
        ]}
        rows={data || []}
        loading={loading}
        empty="No limits are set. Everyone can upload without a limit."
      />
      {edit && (
        <FormModal title="Set a daily upload limit"
          intro="Empty boxes keep their current value. A new row starts at 100 files and 2 GiB per day, with the limit on. Numbers must be 1 or more — to remove a limit, turn 'Limit is on' off instead. You will get the extra password check (step-up)."
          fields={[
            { name: 'role', label: 'Role *', type: 'select', options: ROLES, value: edit.role, required: true },
            { name: 'dailyUploads', label: 'Files per day', type: 'number', value: edit.dailyUploads ?? '' },
            { name: 'dailyBytes', label: 'Data per day (in bytes)', type: 'number', value: edit.dailyBytes ?? '', help: '1 GiB = 1073741824 bytes' },
            { name: 'enabled', label: 'Limit is on', type: 'checkbox', value: edit.enabled ?? true },
          ]}
          submitLabel="Save changes"
          onSubmit={async (v) => { await MediaApi.setQuota(v.role, { dailyUploads: v.dailyUploads, dailyBytes: v.dailyBytes, enabled: v.enabled }); act.setOk('Limit saved.'); reload() }}
          onClose={() => setEdit(null)} />
      )}
    </div>
  )
}
