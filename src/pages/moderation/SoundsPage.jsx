import React, { useState, useEffect } from 'react'
import { SoundsApi, AuditApi, SearchApi, mediaUrl } from '../../api'
import { useLoad, useAction, pageRows, fmtNum, fmtBytes, fmtDate, short } from '../../util'
import {
  DataTable, Tiles, Tabs, Modal, Field, Select, JsonBlock, KV, Badge, StatusBadge,
  SeriesBars, Err, Ok, Note, Warn, Loading, PageIntro, HowTo, Id,
} from '../../components/ui'
import FormModal from '../../components/FormModal'
import { useAuth } from '../../auth/AuthContext'

const SOUND_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED']
const STATUS_OPTIONS = [
  { value: 'PENDING_REVIEW', label: 'Waiting for check (PENDING_REVIEW)' },
  { value: 'APPROVED', label: 'Live in the app (APPROVED)' },
  { value: 'REJECTED', label: 'Rejected (REJECTED)' },
  { value: 'ARCHIVED', label: 'Archived (ARCHIVED)' },
]
const STATUS_LABEL = {
  PENDING_REVIEW: 'Waiting for check',
  APPROVED: 'Live in the app',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
}
const CATEGORIES = [
  { value: 'NASHEED', label: 'NASHEED (religious songs)' },
  { value: 'QURAN_RECITATION', label: 'QURAN_RECITATION (Quran reading)' },
  { value: 'LECTURE_CLIP', label: 'LECTURE_CLIP (talk clips)' },
  { value: 'NATURE', label: 'NATURE (nature sounds)' },
  { value: 'ORIGINAL', label: 'ORIGINAL (user-made audio)' },
  { value: 'PLATFORM_MUSIC', label: 'PLATFORM_MUSIC (our official music)' },
]
const WRITERS = ['ADMIN', 'MODERATOR']
const PAGE_SIZES = ['10', '20', '50', '100']

/* Mirrors the server's accept rule for the multipart upload: an `audio/*` content type (plus
   `video/mp4`, because browsers often label .m4a that way), or a generic content type carrying one
   of these extensions. Checked here as well so a wrong pick is caught before a large file is sent. */
const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'mp4']
/** Server-side duration extraction only works on MP4-container audio; the rest stay null. */
const DURATION_EXTS = ['m4a', 'mp4']
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024 // the global multipart cap

const extOf = (name) => (String(name || '').split('.').pop() || '').toLowerCase()
const looksLikeAudio = (f) => !!f && (String(f.type || '').startsWith('audio/') || f.type === 'video/mp4' || AUDIO_EXTS.includes(extOf(f.name)))
const looksLikeImage = (f) => !!f && (String(f.type || '').startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(extOf(f.name)))
const titleFromFile = (name) => String(name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()

const AUDIT_COLS = [
  { key: 'createdAt', label: 'When', render: (r) => fmtDate(r.createdAt) },
  { key: 'username', label: 'Who did it', render: (r) => r.username || <em className="muted">unknown</em> },
  { key: 'operation', label: 'Action' },
  { key: 'outcome', label: 'Result', render: (r) => <StatusBadge value={r.outcome} /> },
  { key: 'path', label: 'Request (for engineers)', render: (r) => <code>{r.httpMethod} {r.path}</code> },
  { key: 'statusCode', label: 'Code' },
  { key: 'summary', label: 'Notes' },
  { key: 'errorCode', label: 'Error' },
]

const dash = <span className="muted">—</span>
const hideBrokenImg = (e) => { e.currentTarget.style.visibility = 'hidden' }
const trunc = (s, n = 13) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

function fmtDur(sec) {
  const n = Number(sec)
  if (sec == null || !Number.isFinite(n)) return null
  return `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`
}

function hoursSince(iso) {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? (Date.now() - t) / 3600000 : null
}

/** Only meaningful on the legacy PENDING_REVIEW drain — anything past 48h has been forgotten. */
function WaitBadge({ createdAt }) {
  const h = hoursSince(createdAt)
  if (h == null) return null
  return <Badge kind={h > 48 ? 'err' : 'gray'}>waiting {h < 48 ? `${Math.floor(h)}h` : `${Math.floor(h / 24)}d`}</Badge>
}

/** Keyset audit pages are not shape-guaranteed; never let a surprise wrapper crash the drawer. */
function auditRows(d) {
  if (Array.isArray(d)) return d
  for (const k of ['rows', 'content', 'items', 'results', 'data']) if (Array.isArray(d?.[k])) return d[k]
  return []
}

/**
 * Rows are ES ids hydrated from Cassandra, and a row deleted between the two steps is dropped
 * silently — so a page shorter than pageSize proves nothing and only an empty batch is the end.
 * CursorPager tests the *accumulated* array against pageSize, which is wrong in both directions.
 */
function LoadMore({ list, pageSize, busy, onMore }) {
  if (!list || !list.cursor || list.lastBatch === 0) return null
  return (
    <div className="mt-2">
      <button className="small secondary" disabled={busy} onClick={() => onMore(list.cursor)}>
        Load more sounds
      </button>
      <div className="footnote">
        The last load gave {list.lastBatch} of {pageSize} rows. A short page is normal here.
        Keep clicking until a load comes back empty.
      </div>
    </div>
  )
}

export default function SoundsPage() {
  const [tab, setTab] = useState('catalog')
  return (
    <div>
      <PageIntro
        title="Sounds & music"
        lead="Look after the sound library that people use on their posts and reels."
        bullets={[
          'You can see every sound, grouped by status.',
          'You can add new sounds — upload a file, paste a link, or add many at once.',
          'You can approve, reject, archive, or restore a sound.',
          'You can remove a sound after a rights claim, or delete it forever.',
          'You can see the top sounds and fix the search list.',
        ]}
      />
      <Note>
        Only admin staff can add sounds. Normal users cannot upload sounds any more (rule since
        2026-08-08). A sound you add goes live right away — there is no extra publish step. The{' '}
        <strong>Waiting for check</strong> list holds only old sounds from before this rule. If that
        list is empty, that is normal — the real work here is looking after the live library.
      </Note>
      <Tabs tabs={[
        { id: 'catalog', label: 'All sounds' },
        { id: 'add', label: 'Add sounds' },
        { id: 'uploader', label: 'Sounds by one person' },
        { id: 'trending', label: 'Top sounds' },
        { id: 'index', label: 'Search list health' },
      ]} active={tab} onChange={setTab} />
      {tab === 'catalog' && <Catalog />}
      {tab === 'add' && <AddToLibrary />}
      {tab === 'uploader' && <UploaderHistory />}
      {tab === 'trending' && <TrendingBoard />}
      {tab === 'index' && <IndexHealth />}
    </div>
  )
}

function Catalog() {
  const { user } = useAuth()
  const canWrite = WRITERS.includes(user?.role)
  const gate = canWrite ? undefined : `You need the ADMIN or MODERATOR role to change sounds. Your role is ${user?.role || 'unknown'}.`

  const counts = useLoad(() => SoundsApi.statusCounts(), [])
  const [status, setStatus] = useState('APPROVED')
  const [uploaderId, setUploaderId] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [nonce, setNonce] = useState(0)
  const [list, setList] = useState(null) // {rows, lastBatch, cursor}
  const [detail, setDetail] = useState(null)
  const [modal, setModal] = useState(null)

  const fetchAct = useAction() // reads — kept apart so a refetch can't wipe a mutation's message
  const act = useAction()

  const fetchPage = async (cursor) => {
    const res = await fetchAct.run(() => SoundsApi.list({ status, uploaderId: uploaderId || undefined, cursor, pageSize }))
    if (!res) return
    const batch = pageRows(res)
    setList((prev) => ({
      rows: cursor ? [...(prev?.rows || []), ...batch] : batch,
      lastBatch: batch.length,
      // Verbatim from the last row of the last batch — the server reads it as UTC.
      cursor: batch.length ? batch[batch.length - 1]?.createdAt : null,
    }))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPage(undefined) }, [status, pageSize, nonce])
  const refresh = () => { setNonce((n) => n + 1); counts.reload() }
  const doSimple = async (fn, msg) => { await act.run(fn, msg); refresh() }
  const openDetail = async (id) => { const d = await fetchAct.run(() => SoundsApi.detail(id)); if (d) setDetail(d) }
  // Actions launched from the open drawer refetch it, so the drawer never shows stale data.
  const refreshDetail = (id) => { if (detail?.sound?.id === id) openDetail(id) }
  const toggleTrending = async (r) => {
    await act.run(() => SoundsApi.trendingExclude(r.id, !r.trendingExcluded),
      r.trendingExcluded ? 'This sound can show in the top sounds list again.' : 'This sound is now hidden from the top sounds list in the app.')
    refresh(); refreshDetail(r.id)
  }

  const c = counts.data || {}
  const esBroken = SOUND_STATUSES.some((s) => c[s] === -1)
  const countValue = (v) => (v === -1 ? <Badge kind="err">count failed</Badge> : v == null ? dash : fmtNum(v))
  const subFor = {
    PENDING_REVIEW: 'old sounds only — nothing new arrives here',
    APPROVED: 'people can use these now',
    REJECTED: 'hidden from the app, kept for records',
    ARCHIVED: 'retired — no new use',
  }

  const rows = list?.rows || []

  return (
    <div>
      <HowTo steps={[
        'Pick a status in the "Show" box. "Live in the app" is the main library.',
        'Click a row, or its "Open" button, to open one sound. You can listen to it there.',
        'Use the small buttons on a row to approve, reject, archive, or restore a sound.',
        'Open a sound to edit it, change its type, hide it from top sounds, remove it after a rights claim, or delete it forever.',
        'Click "Load more sounds" at the bottom to see older rows.',
      ]} />
      <Err e={counts.err} />
      {counts.data && (
        <Tiles items={SOUND_STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: countValue(c[s]), sub: subFor[s] }))} />
      )}
      {esBroken && (
        <Warn>
          Some counts failed (shown as &quot;count failed&quot;). The search system did not answer.
          The list below also comes from the search system, so it may be short or empty for a
          while. Check the <strong>Search list health</strong> tab.
        </Warn>
      )}
      <Note>
        Order of the list: the <strong>Waiting for check</strong> list shows the oldest sound first.
        Every other list shows the newest first.
      </Note>
      <Note>
        There are two ways to retire a sound. <strong>Archive</strong> stops new use only — posts
        that already use the sound keep it. <strong>Remove (rights claim / takedown)</strong> can
        also mute the sound on those old posts. Both end as ARCHIVED. Pick by the reason, not by
        the end state.
      </Note>

      <div className="filters">
        <Field label="Show">
          <Select value={status} onChange={(v) => setStatus(v || 'APPROVED')} options={STATUS_OPTIONS} allowEmpty={false} />
        </Field>
        <Field label="Added by (user id — for new sounds this is the admin who added it)">
          <input value={uploaderId} onChange={(e) => setUploaderId(e.target.value)} className="w-id" />
        </Field>
        <Field label="Rows per load">
          <Select value={String(pageSize)} onChange={(v) => setPageSize(Number(v) || 20)} options={PAGE_SIZES} allowEmpty={false} />
        </Field>
        <button disabled={fetchAct.busy} onClick={() => setNonce((n) => n + 1)}>Apply and refresh</button>
      </div>
      <div className="footnote">
        If a sound was deleted while this page was open, its buttons will answer &quot;not
        found&quot; (SOUND_NOT_FOUND). Click &quot;Apply and refresh&quot; to reload the list.
      </div>

      <Err e={fetchAct.err} /><Err e={act.err} /><Ok msg={act.ok} />

      <DataTable
        columns={[
          {
            key: 'coverArtUrl', label: '', render: (r) => (r.coverArtUrl
              ? <img src={mediaUrl(r.coverArtUrl)} alt="" onError={hideBrokenImg} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
              : dash),
          },
          {
            key: 'title', label: 'Name', render: (r) => (
              <span className="row snug">
                <strong>{r.title}</strong>
                {r.official ? <Badge kind="green">official</Badge> : null}
                {r.trendingExcluded ? <Badge kind="gray">hidden from top sounds</Badge> : null}
              </span>
            ),
          },
          { key: 'artistName', label: 'Artist' },
          { key: 'category', label: 'Type (category)' },
          {
            key: 'status', label: 'Status', render: (r) => (
              <span className="row snug">
                <StatusBadge value={r.status} />
                {r.status === 'PENDING_REVIEW' ? <WaitBadge createdAt={r.createdAt} /> : null}
              </span>
            ),
          },
          { key: 'durationSeconds', label: 'Length', render: (r) => fmtDur(r.durationSeconds) ?? dash },
          { key: 'useCount', label: 'Posts using it', render: (r) => <span className="right">{fmtNum(r.useCount ?? 0)}</span> },
          { key: 'createdAt', label: 'Added', render: (r) => fmtDate(r.createdAt) },
          {
            // Only status moves live on the row. Edit, type, trending, takedown, and
            // delete live inside the drawer ("Open"), which shows the full context first.
            key: '_', label: 'Actions', render: (r) => (
              <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                {r.status === 'PENDING_REVIEW' && (
                  <button className="small" disabled={!canWrite || act.busy} title={gate}
                    onClick={() => doSimple(() => SoundsApi.approve(r.id), 'Sound approved. It is live in the app now.')}>Approve</button>
                )}
                {r.status !== 'REJECTED' && (
                  <button className="small danger" disabled={!canWrite} title={gate} onClick={() => setModal({ kind: 'reject', row: r })}>Reject</button>
                )}
                {r.status === 'APPROVED' && (
                  <button className="small secondary" disabled={!canWrite} title={gate} onClick={() => setModal({ kind: 'archive', row: r })}>Archive</button>
                )}
                {(r.status === 'REJECTED' || r.status === 'ARCHIVED') && (
                  <button className="small" disabled={!canWrite} title={gate} onClick={() => setModal({ kind: 'restore', row: r })}>Restore</button>
                )}
                <button className="small secondary" onClick={() => openDetail(r.id)}>Open</button>
              </span>
            ),
          },
        ]}
        rows={rows}
        loading={fetchAct.busy}
        onRow={(r) => openDetail(r.id)}
        empty={status === 'PENDING_REVIEW' ? 'No sounds are waiting for a check. Nothing to do here right now.' : 'No sounds match this filter.'}
      />
      <LoadMore list={list} pageSize={pageSize} busy={fetchAct.busy} onMore={(cur) => fetchPage(cur)} />

      {detail && (
        <SoundDrawer detail={detail} onClose={() => setDetail(null)} canWrite={canWrite} gate={gate} act={act}
          onModal={(kind, row) => setModal({ kind, row })} onTrendingToggle={toggleTrending} />
      )}

      {modal?.kind === 'reject' && (
        <FormModal title={`Reject "${modal.row.title}"`} danger
          intro="This hides the sound from the app and from search. We keep the record for the action history. The person who added it gets a message with your reason code."
          fields={[
            { name: 'reasonCode', label: 'Reason code (short, up to 100 letters)', placeholder: 'COPYRIGHT', help: 'A short code. The person who added the sound will see it.' },
            { name: 'note', label: 'Note (up to 500 letters)', type: 'textarea' },
          ]}
          submitLabel="Reject this sound"
          onSubmit={async (v) => { await SoundsApi.reject(modal.row.id, v); act.setOk('Sound rejected. It is hidden from the app. The record is kept.'); refresh() }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'archive' && (
        <FormModal title={`Archive "${modal.row.title}"`}
          intro='This stops people from using the sound on new posts. Posts that already use it keep the sound. If the sound must also go quiet on those old posts, cancel and use "Remove (rights claim)" instead.'
          fields={[{ name: 'reason', label: 'Why are you archiving it? (up to 500 letters)', type: 'textarea', placeholder: 'Low quality / a copy of the official one…' }]}
          submitLabel="Archive this sound"
          onSubmit={async (v) => { await SoundsApi.archive(modal.row.id, v.reason); act.setOk('Sound archived. No new posts can use it. Old posts keep it.'); refresh() }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'restore' && (
        <FormModal title={`Restore "${modal.row.title}"`}
          intro="This puts the sound back in the live library and in search. Use it after a mistake, or when a rights dispute ends in the uploader's favor."
          fields={[{ name: 'reason', label: 'Why are you restoring it? (up to 500 letters)', type: 'textarea' }]}
          submitLabel="Restore this sound"
          onSubmit={async (v) => { await SoundsApi.restore(modal.row.id, v.reason); act.setOk('Sound restored. It is live in the app again.'); refresh() }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'category' && (
        <FormModal title={`Change the type of "${modal.row.title}"`}
          intro="Pick the new type. The sound moves to that browse list in the app."
          fields={[{ name: 'category', label: 'New type *', type: 'select', options: CATEGORIES, value: modal.row.category, required: true }]}
          submitLabel="Save new type"
          onSubmit={async (v) => { await SoundsApi.setCategory(modal.row.id, v.category); act.setOk('Type changed.'); refresh(); refreshDetail(modal.row.id) }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'edit' && (
        <FormModal title={`Edit "${modal.row.title}"`}
          intro="You can change the name, the artist, and the cover picture. A blank name keeps the old name. A blank artist or cover picture removes it."
          fields={[
            { name: 'title', label: 'Name', value: modal.row.title || '', help: 'Leave blank to keep the old name.' },
            // keepEmpty sends '' instead of dropping the key, which is what makes clearing possible:
            // the server applies artistName/coverArtUrl whenever the key is present.
            { name: 'artistName', label: 'Artist', value: modal.row.artistName || '', keepEmpty: true, help: 'Leave blank to remove the artist name.' },
            { name: 'coverArtUrl', label: 'Cover picture link (URL)', value: modal.row.coverArtUrl || '', keepEmpty: true, help: 'Leave blank to remove the cover picture.' },
          ]}
          submitLabel="Save changes"
          onSubmit={async (v) => { await SoundsApi.edit(modal.row.id, v); act.setOk('Details saved.'); refresh(); refreshDetail(modal.row.id) }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'takedown' && (
        <FormModal title={`Remove for a rights claim (takedown) — "${modal.row.title}"`} danger requireText="TAKEDOWN" wide
          intro={`Use this when a music owner or the law says the sound must go. The sound is archived. If you tick the mute box, the sound also goes quiet on the ${fmtNum(modal.row.useCount ?? 0)} post(s) that already use it — you cannot undo that. One run handles up to 20,000 posts; run it again for more. You will be asked for your password again (extra password check, step-up).`}
          fields={[
            { name: 'reason', label: 'Why are you removing it?', type: 'textarea', placeholder: 'Rights claim number / safety case…' },
            { name: 'muteAdoptingPosts', label: 'Also mute the sound on posts that already use it', type: 'checkbox', help: 'Leave this off if the claim only blocks future use.' },
            { name: 'rightsClaimId', label: 'Rights claim number (id)' },
          ]}
          submitLabel="Remove this sound (asks for your password)"
          onSubmit={async (v) => { const r = await SoundsApi.takedown(modal.row.id, v); act.setOk(`Done. The sound is removed. ${fmtNum(r?.mutedPosts ?? 0)} post(s) were muted.`); refresh(); refreshDetail(modal.row.id) }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'delete' && (
        <FormModal title={`Delete "${modal.row.title}" forever`} danger requireText="DELETE"
          intro={`This deletes the sound and all its records everywhere. You cannot undo it. ${fmtNum(modal.row.useCount ?? 0)} post(s) use this sound right now. Use this only for a legal erase request — otherwise archive it instead. You will be asked for your password again (extra password check, step-up).`}
          fields={[{ name: 'reason', label: 'Why are you deleting it?', type: 'textarea' }]}
          submitLabel="Delete forever (asks for your password)"
          onSubmit={async (v) => { await SoundsApi.hardDelete(modal.row.id, v.reason); act.setOk('Sound deleted forever.'); refresh(); if (detail?.sound?.id === modal.row.id) setDetail(null) }}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function SoundDrawer({ detail, onClose, canWrite, gate, act, onModal, onTrendingToggle }) {
  const s = detail?.sound || {}
  const recent = detail?.recentPosts || []
  const audit = useLoad(() => (s.id ? AuditApi.byResource('SOUND', s.id, { pageSize: 20 }) : Promise.resolve([])), [s.id])
  const [raw, setRaw] = useState(false)
  const trail = auditRows(audit.data)

  return (
    <Modal title={s.title || 'Sound'} onClose={onClose} wide>
      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        {s.coverArtUrl
          ? <img src={mediaUrl(s.coverArtUrl)} alt="" onError={hideBrokenImg} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
          : null}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{s.title || dash}</div>
          <div className="muted">{s.artistName || 'unknown artist'}{fmtDur(s.durationSeconds) ? ` · ${fmtDur(s.durationSeconds)}` : ''}</div>
          <div className="row snug mt-2">
            <StatusBadge value={s.status} />
            <Badge kind="blue">{s.category || 'no type set'}</Badge>
            {s.official ? <Badge kind="green">official</Badge> : null}
            {s.trendingExcluded ? <Badge kind="gray">hidden from top sounds</Badge> : null}
            {s.status === 'PENDING_REVIEW' ? <WaitBadge createdAt={s.createdAt} /> : null}
          </div>
        </div>
      </div>

      {/* Keyed on the url: without it React reuses the element and the browser can keep playing the previous track. */}
      {s.audioUrl ? <p><audio key={s.audioUrl} controls src={mediaUrl(s.audioUrl)} style={{ width: '100%' }} /></p> : <Warn>This sound has no audio file link. There is nothing to play.</Warn>}

      <h3>Change this sound</h3>
      <div className="row tight">
        <button className="small secondary" disabled={!canWrite} title={gate} onClick={() => onModal('edit', s)}>Edit details</button>
        <button className="small secondary" disabled={!canWrite} title={gate} onClick={() => onModal('category', s)}>Change type</button>
        <button className="small secondary" disabled={!canWrite || act.busy} title={gate} onClick={() => onTrendingToggle(s)}>
          {s.trendingExcluded ? 'Show in top sounds' : 'Hide from top sounds'}
        </button>
        <button className="small danger" disabled={!canWrite} title={gate} onClick={() => onModal('takedown', s)}>Remove (rights claim)</button>
        <button className="small danger" disabled={!canWrite} title={gate} onClick={() => onModal('delete', s)}>Delete forever</button>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />

      <h3>How much is this sound used?</h3>
      <Tiles items={[
        { label: 'Posts using this sound', value: fmtNum(s.useCount ?? 0), sub: 'the true total — check it before a removal' },
        { label: 'Recent posts shown below', value: fmtNum(recent.length), sub: 'newest 20 at most' },
      ]} />
      <DataTable
        columns={[
          { key: 'postId', label: 'Post', render: (r) => <Id v={r.postId} /> },
          { key: 'authorId', label: 'Who posted it', render: (r) => <Id v={r.authorId} /> },
          { key: 'createdAt', label: 'When', render: (r) => fmtDate(r.createdAt) },
        ]}
        rows={recent}
        rowKey={(r) => r.postId}
        empty="No posts use this sound yet."
      />
      <div className="footnote">
        This table shows only the newest 20 posts. The number above is the true total.
      </div>

      <h3>Where this sound came from</h3>
      <KV obj={{
        'Sound id': s.id,
        'Added by (user id)': s.uploaderId,
        'Added on': fmtDate(s.createdAt),
        'Last change': fmtDate(s.updatedAt),
        'Audio file link': s.audioUrl,
        'Cover picture link': s.coverArtUrl,
      }} />

      <h3>Action history for this sound</h3>
      <Err e={audit.err} />
      <DataTable columns={AUDIT_COLS} rows={trail} rowKey={(r) => r.id || `${r.createdAt}-${r.path}`} loading={audit.loading} empty="No admin actions recorded for this sound yet." />
      <div className="footnote">The newest 20 actions on this sound.</div>

      <div className="row mt-2">
        <button className="small secondary" onClick={() => setRaw(!raw)}>{raw ? 'Hide raw data' : 'Show raw data (for engineers)'}</button>
      </div>
      {raw && <JsonBlock v={detail} />}
    </Modal>
  )
}

function AddToLibrary() {
  const { user } = useAuth()
  const canWrite = WRITERS.includes(user?.role)
  const gate = canWrite ? undefined : `You need the ADMIN or MODERATOR role to add sounds. Your role is ${user?.role || 'unknown'}.`
  // One action state per card, so each card's banner sits under the button that caused it.
  const linkAct = useAction()
  const importAct = useAction()
  const [createOpen, setCreateOpen] = useState(false)
  const [created, setCreated] = useState([])
  const [text, setText] = useState('')
  const [imported, setImported] = useState(null)

  const resultCols = [
    { key: 'title', label: 'Name' },
    { key: 'category', label: 'Type' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'official', label: 'Official' },
    { key: 'id', label: 'Id', render: (r) => <Id v={r.id} /> },
  ]

  const runImport = async () => {
    let items
    try { items = JSON.parse(text) } catch (e) { importAct.setErr({ message: `This is not valid JSON: ${e.message}` }); return }
    if (!Array.isArray(items)) { importAct.setErr({ errorCode: 'INVALID_IMPORT_BATCH', message: 'Paste a JSON list (an array) of items.' }); return }
    // Mirror the server bound so an obvious mistake never costs a round trip.
    if (items.length < 1 || items.length > 100) {
      importAct.setErr({ errorCode: 'INVALID_IMPORT_BATCH', message: `Give 1 to 100 items in one batch. Your list has ${items.length}.` })
      return
    }
    const res = await importAct.run(() => SoundsApi.importOfficial(items), `Added ${items.length} sound(s). All are live and marked official.`)
    if (res) setImported(pageRows(res))
  }

  return (
    <div>
      <HowTo steps={[
        'To add a sound file from your computer, use the "Upload a sound file" box below.',
        'To add a sound that already lives on the web, click "Add one sound by link" and paste the link.',
        'Either way the sound goes live right away. There is no extra publish step.',
        'To add many official sounds at once, paste a JSON list in the big box and click "Import the list".',
        'Each item in the list needs a name (title) and an audio file link (audioUrl).',
      ]} />

      <UploadSoundCard canWrite={canWrite} gate={gate} resultCols={resultCols} />

      <div className="grid2">
        <div className="card">
          <h2>Add one sound by link (URL)</h2>
          <Note>
            Use this when the audio file already sits somewhere on the web. Nothing is copied — the
            app plays the link you give. If the link ever dies, the sound goes silent, so upload the
            file instead when you have it.
          </Note>
          <div className="footnote">
            The name and the audio file link are required. Leaving them blank gives the error
            INVALID_IMPORT_ITEM. A wrong type gives INVALID_CATEGORY.
          </div>
          <div className="row mt-2">
            <button disabled={!canWrite} title={gate} onClick={() => setCreateOpen(true)}>+ Add one sound by link…</button>
          </div>
          <Err e={linkAct.err} /><Ok msg={linkAct.ok} />
          {created.length > 0 && <DataTable columns={resultCols} rows={created} />}
        </div>

        <div className="card">
          <h2>Add many official sounds at once (bulk import)</h2>
          <Note>
            This adds first-party sounds in one call. Every item goes live right away and is marked{' '}
            <strong>official</strong>, with you recorded as the person who added it. Give 1 to 100
            items per batch. Each item needs a name (<code>title</code>) and an audio file link
            (<code>audioUrl</code>). If you leave out the type, it becomes PLATFORM_MUSIC.
          </Note>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)}
            placeholder='[{"title":"Morning Birdsong","audioUrl":"https://cdn.example.com/official/birdsong.mp3","category":"NATURE","durationSeconds":30}]' />
          <div className="footnote">Paste a JSON list of {'{title, audioUrl, artistName?, coverArtUrl?, durationSeconds?, category?}'}.</div>
          <div className="row mt-2">
            <button disabled={!canWrite || importAct.busy || !text.trim()} title={gate} onClick={runImport}>Import the list</button>
          </div>
          <Err e={importAct.err} /><Ok msg={importAct.ok} />
          {imported && <DataTable columns={resultCols} rows={imported} empty="The import returned no rows." />}
        </div>
      </div>

      {createOpen && (
        <FormModal title="Add one sound by link (URL)" wide
          intro="The sound goes live right away, with you recorded as the person who added it. It shows in browse and search at once — there is no extra publish step. The audio file stays where it is; we only keep the link."
          fields={[
            { name: 'title', label: 'Name *', required: true },
            { name: 'audioUrl', label: 'Audio file link (URL) *', required: true, placeholder: 'https://cdn.example.com/…' },
            { name: 'artistName', label: 'Artist' },
            { name: 'coverArtUrl', label: 'Cover picture link (URL)' },
            { name: 'durationSeconds', label: 'Length (seconds)', type: 'number' },
            { name: 'category', label: 'Type *', type: 'select', options: CATEGORIES, value: 'PLATFORM_MUSIC', required: true },
            { name: 'official', label: 'Official (made by us, first-party)', type: 'checkbox', value: false },
          ]}
          submitLabel="Add this sound"
          onSubmit={async (v) => {
            const row = await SoundsApi.create(v)
            if (row) setCreated((s) => [row, ...s])
            linkAct.setOk(`"${v.title}" added. It is live in the app now.`)
          }}
          onClose={() => setCreateOpen(false)} />
      )}
    </div>
  )
}

/**
 * Multipart create — `POST /api/v1/admin/sounds/upload`. Not a FormModal: that component has no
 * file field, and a picked file wants a preview player and a size line next to it anyway.
 */
function UploadSoundCard({ canWrite, gate, resultCols }) {
  const act = useAction()
  const [file, setFile] = useState(null)
  const [cover, setCover] = useState(null)
  const [preview, setPreview] = useState(null)   // object URL for local playback, before any upload
  const [title, setTitle] = useState('')
  const [artistName, setArtistName] = useState('')
  const [duration, setDuration] = useState('')
  const [category, setCategory] = useState('PLATFORM_MUSIC')
  const [official, setOfficial] = useState(false)
  const [added, setAdded] = useState([])
  const [formNonce, setFormNonce] = useState(0) // remounts the file inputs — a DOM file input cannot be cleared from state

  /* The server can only read the length out of MP4-container audio, so an mp3 would land with an
     empty Length column forever. The browser can read it from the local file for every format —
     do that and prefill the field, still editable. */
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    const el = new Audio()
    el.preload = 'metadata'
    const onMeta = () => {
      const d = el.duration
      if (Number.isFinite(d) && d > 0) setDuration((cur) => cur || String(Math.round(d)))
    }
    el.addEventListener('loadedmetadata', onMeta)
    el.src = url
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.src = ''
      URL.revokeObjectURL(url)
    }
  }, [file])

  const pickFile = (f) => {
    act.clear()
    setDuration('')
    setFile(f)
    if (f) setTitle((t) => t || titleFromFile(f.name))
  }

  const reset = () => {
    setFile(null); setCover(null); setTitle(''); setArtistName(''); setDuration('')
    setCategory('PLATFORM_MUSIC'); setOfficial(false)
    setFormNonce((n) => n + 1)
  }

  const badAudio = file && !looksLikeAudio(file)
  const badCover = cover && !looksLikeImage(cover)
  const tooBig = file && file.size > MAX_UPLOAD_BYTES
  const noDurationServerSide = file && !DURATION_EXTS.includes(extOf(file.name))
  const blocked = !canWrite || act.busy || !file || !title.trim() || badAudio || badCover || tooBig

  const submit = async () => {
    const row = await act.run(
      () => SoundsApi.upload(file, cover, { title: title.trim(), artistName: artistName.trim(), durationSeconds: duration, category, official }),
      `"${title.trim()}" uploaded. It is live in the app now.`,
    )
    if (row) { setAdded((s) => [row, ...s]); reset() }
  }

  return (
    <div className="card">
      <h2>Upload a sound file from your computer</h2>
      <Note>
        Pick an audio file and it is stored by us, so the sound keeps working even if the original
        file is deleted somewhere else. The sound goes live (APPROVED) right away, with you recorded
        as the person who added it, and it shows in browse and search at once.
      </Note>
      <div className="form-grid">
        <Field label="Sound file *">
          <input key={`f${formNonce}`} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.mp4"
            onChange={(e) => pickFile(e.target.files?.[0] || null)} />
        </Field>
        <Field label="Cover picture (not required)">
          <input key={`c${formNonce}`} type="file" accept="image/*" onChange={(e) => { act.clear(); setCover(e.target.files?.[0] || null) }} />
        </Field>
      </div>

      {file && (
        <div className="footnote">
          {file.name} · {fmtBytes(file.size)}{cover ? ` · cover: ${cover.name} (${fmtBytes(cover.size)})` : ''}
        </div>
      )}
      {badAudio && (
        <Warn>
          This does not look like an audio file. Use MP3, M4A, AAC, WAV, OGG, OPUS, or MP4. Sending
          it gives the error SOUND_FILE_INVALID.
        </Warn>
      )}
      {badCover && <Warn>The cover must be a picture (JPG, PNG, WEBP…). Sending it gives the error SOUND_FILE_INVALID.</Warn>}
      {tooBig && <Warn>This file is {fmtBytes(file.size)}. The limit is 500 MB. Pick a smaller file.</Warn>}
      {preview && !badAudio && (
        <p><audio key={preview} controls src={preview} style={{ width: '100%' }} /></p>
      )}

      <div className="form-grid">
        <Field label="Name *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-id" placeholder="Evening Adhan" />
        </Field>
        <Field label="Artist">
          <input value={artistName} onChange={(e) => setArtistName(e.target.value)} className="w-sm" />
        </Field>
        <Field label="Length (seconds)">
          <input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} className="w-num" />
        </Field>
        <Field label="Type *">
          <Select value={category} onChange={(v) => setCategory(v || 'PLATFORM_MUSIC')} options={CATEGORIES} allowEmpty={false} />
        </Field>
        <Field label="Official (made by us)">
          <input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} />
        </Field>
      </div>
      <div className="footnote">
        {file
          ? (duration
            ? 'The length was read from your file. You can change it.'
            : (noDurationServerSide
              ? 'We could not read the length of this file. You can type it, or leave it empty — the app reads the real length when it plays the sound.'
              : 'Leave the length empty and the server reads it from the file.'))
          : 'The name is required. The length is filled in for you once you pick a file.'}
      </div>

      <div className="row mt-2">
        <button disabled={blocked} title={gate} onClick={submit}>
          {act.busy ? 'Uploading… please wait' : 'Upload and add this sound'}
        </button>
        <button className="secondary" disabled={act.busy || (!file && !title)} onClick={() => { act.clear(); reset() }}>Clear the form</button>
      </div>
      {act.busy && <div className="footnote">A big file takes a while. Do not close this page.</div>}
      <Err e={act.err} /><Ok msg={act.ok} />
      {added.length > 0 && (
        <>
          <h3>Uploaded in this session</h3>
          <DataTable columns={resultCols} rows={added} />
        </>
      )}
    </div>
  )
}

function UploaderHistory() {
  const act = useAction()
  const [userId, setUserId] = useState('')
  const [list, setList] = useState(null)
  const pageSize = 20

  const fetchPage = async (cursor) => {
    const res = await act.run(() => SoundsApi.byUploader(userId, { cursor, pageSize }))
    if (!res) return
    const batch = pageRows(res)
    setList((prev) => ({
      rows: cursor ? [...(prev?.rows || []), ...batch] : batch,
      lastBatch: batch.length,
      cursor: batch.length ? batch[batch.length - 1]?.createdAt : null,
    }))
  }

  const rows = list?.rows || []
  const n = rows.length
  const byStatus = Object.fromEntries(SOUND_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]))
  const ratio = n ? Math.round((byStatus.APPROVED / n) * 100) : null

  return (
    <div className="card">
      <HowTo steps={[
        'Paste the person\'s user id in the box.',
        'Click "Show their sounds".',
        'Read the tiles: how many of their sounds were approved or rejected.',
        'Click "Load more sounds" to see older rows before you judge the person.',
      ]} />
      <Note>
        This shows every sound one person added, newest first. Since 2026-08-08 only admin staff can
        add sounds, so for new sounds this is <strong>the admin who added them</strong>. Only old
        sounds can have a normal user here — for those, this view helps you spot someone who kept
        adding bad sounds. An unknown id just shows an empty list.
      </Note>
      <div className="filters">
        <Field label="User id *"><input value={userId} onChange={(e) => setUserId(e.target.value)} className="w-id" /></Field>
        <button disabled={!userId || act.busy} onClick={() => fetchPage(undefined)}>Show their sounds</button>
      </div>
      <Err e={act.err} /><Loading on={act.busy && !list} />
      {list && (
        <>
          <Tiles items={[
            ...SOUND_STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: fmtNum(byStatus[s]) })),
            { label: 'Percent approved', value: ratio == null ? '—' : `${ratio}%`, sub: `of the ${n} sound(s) loaded here` },
          ]} />
          <div className="footnote">
            These numbers count only the rows loaded on this page — not the person&apos;s full
            history. Load more pages before you judge.
          </div>
          {byStatus.REJECTED >= 3 && (
            <Warn>
              {byStatus.REJECTED} of the {n} sound(s) loaded were rejected. This person may be adding
              bad sounds again and again. Read the reject reasons before you restore anything.
            </Warn>
          )}
          <DataTable
            columns={[
              { key: 'title', label: 'Name', render: (r) => (
                <span className="row snug">
                  <strong>{r.title}</strong>
                  {r.official ? <Badge kind="green">official</Badge> : null}
                </span>
              ) },
              { key: 'category', label: 'Type' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
              { key: 'durationSeconds', label: 'Length', render: (r) => fmtDur(r.durationSeconds) ?? dash },
              { key: 'useCount', label: 'Posts using it', render: (r) => fmtNum(r.useCount ?? 0) },
              { key: 'createdAt', label: 'Added', render: (r) => fmtDate(r.createdAt) },
            ]}
            rows={rows}
            loading={act.busy}
            empty="This person has not added any sounds."
          />
          <LoadMore list={list} pageSize={pageSize} busy={act.busy} onMore={(cur) => fetchPage(cur)} />
        </>
      )}
    </div>
  )
}

function TrendingBoard() {
  const [days, setDays] = useState(7)
  const [limit, setLimit] = useState(20)
  const { data, err, loading, reload } = useLoad(() => SoundsApi.trending({ days, limit }), [days, limit])
  const rows = pageRows(data)

  const series = {}
  rows.forEach((r, i) => {
    // SeriesBars sorts keys alphabetically, so the rank has to be padded to the widest rank the
    // clamped limit allows (100) or "100" would sort before "99".
    series[`${String(r.rank ?? i + 1).padStart(3, '0')} ${r.title ? trunc(r.title) : short(r.soundId)}`] = Number(r.adoptions) || 0
  })

  const clamp = (v, lo, hi, dflt) => {
    // An emptied input is Number('') === 0, which would silently clamp to the floor instead of
    // falling back to the documented default.
    if (v === '' || v == null) return dflt
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt
  }

  return (
    <div className="card">
      <HowTo steps={[
        'Pick how many days to look back (1 to 14).',
        'The chart and the table show the sounds used most in that time.',
        'To hide a sound from the top sounds list in the app, go to the "All sounds" tab and click "Hide from top sounds" on its row.',
      ]} />
      <Note>
        This board shows the raw use counts. A sound you hid from the app&apos;s top sounds list
        still shows here — the hide only changes what users see.
      </Note>
      <div className="filters">
        <Field label="Days back (1–14)">
          <input type="number" min={1} max={14} value={days} onChange={(e) => setDays(clamp(e.target.value, 1, 14, 7))} />
        </Field>
        <Field label="How many sounds (1–100)">
          <input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(clamp(e.target.value, 1, 100, 20))} />
        </Field>
        <button className="secondary" onClick={reload}>Refresh the list</button>
      </div>
      <Err e={err} />
      {rows.length > 0 && (
        <div style={{ margin: '8px 0 14px' }}>
          <SeriesBars series={series} limit={Math.max(rows.length, 1)} />
          <div className="footnote">Each label is the rank plus a short name. Full names and ids are in the table below.</div>
        </div>
      )}
      <DataTable
        columns={[
          { key: 'rank', label: 'Rank' },
          { key: 'title', label: 'Name', render: (r) => r.title || <span className="muted">(sound was deleted — the count remains)</span> },
          { key: 'soundId', label: 'Sound id', render: (r) => <Id v={r.soundId} /> },
          { key: 'adoptions', label: 'Times used', render: (r) => fmtNum(r.adoptions ?? 0) },
        ]}
        rows={rows}
        rowKey={(r) => r.soundId}
        loading={loading}
        empty="No sounds were used in this time window."
      />
    </div>
  )
}

function IndexHealth() {
  const act = useAction()
  const { user } = useAuth()
  // The rest of this page is ADMIN|MODERATOR, but the reindex is a search-ops route and those are
  // ADMIN-only — a moderator here would otherwise get an enabled button that 403s.
  const canReindex = user?.role === 'ADMIN'
  const gate = canReindex ? undefined : `Only the ADMIN role can rebuild the search list. Your role is ${user?.role || 'unknown'}.`
  const [drop, setDrop] = useState(true)
  const [result, setResult] = useState(null)
  const [confirm, setConfirm] = useState(false)

  const run = async () => {
    const r = await act.run(() => SearchApi.reindex('sounds', drop), 'Rebuild finished.')
    if (r) setResult(r)
  }

  // Field names differ between the summary doc and older builds — read both.
  const indexed = result?.indexed ?? result?.documentsIndexed
  const ms = result?.ms ?? result?.durationMs
  const dropped = result?.dropped

  return (
    <div className="card">
      <h2>Rebuild the sound search list</h2>
      <HowTo steps={[
        'Use this when sound search shows wrong or missing results.',
        'Leave "delete the list first" ticked if the search filters stopped working — that fixes a broken list structure.',
        'Click the rebuild button and wait. The page holds until it is done.',
        'Do this at a quiet time: while it runs with "delete first" on, sound search shows nothing.',
      ]} />
      <Note>
        The app finds sounds through a search list (the <code>irc-sounds</code> index). The sound
        library is small enough that a full rebuild is safe here. Ticking{' '}
        <strong>delete the list first</strong> also rebuilds the list structure — that is the fix
        when status or type filters silently stopped matching.
      </Note>
      <Warn>
        The rebuild runs while you wait and can take a while. With &quot;delete first&quot; on,
        sound search and browse show nothing in the app until it finishes.
      </Warn>
      <div className="filters">
        <Field label="Delete the list first, then rebuild it (drop)">
          <input type="checkbox" checked={drop} onChange={(e) => setDrop(e.target.checked)} />
        </Field>
        <button className={drop ? 'danger' : ''} disabled={act.busy || !canReindex} title={gate} onClick={() => (drop ? setConfirm(true) : run())}>
          {act.busy ? 'Rebuilding…' : drop ? 'Delete & rebuild the search list' : 'Rebuild the search list'}
        </button>
        {!canReindex && <span className="muted">{gate}</span>}
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      {result && (
        <>
          <Note>{result.note}</Note>
          <Tiles items={[
            { label: 'List deleted first', value: typeof dropped === 'boolean' ? (dropped ? 'yes' : 'no') : (dropped == null ? '—' : fmtNum(dropped)) },
            { label: 'Sounds put in the list', value: indexed == null ? '—' : fmtNum(indexed) },
            { label: 'Batches', value: result.batches == null ? '—' : fmtNum(result.batches) },
            { label: 'Time taken', value: ms == null ? '—' : `${fmtNum(ms)} ms` },
          ]} />
          <JsonBlock v={result} />
        </>
      )}
      <div className="footnote">
        The sound lists on this page come from the search system, which updates with a small delay.
        A sound you just added can take a moment to show up — the sound itself already exists.
      </div>

      {confirm && (
        <FormModal title="Delete and rebuild the sound search list" danger requireText="REINDEX"
          intro="The old list is deleted first. Until the rebuild finishes, sound search, browse, and the lists on this page all show nothing. Do this at a quiet time. It does not delete any sounds — only the search list."
          fields={[]}
          submitLabel="Delete & rebuild"
          onSubmit={async () => { await run() }}
          onClose={() => setConfirm(false)} />
      )}
    </div>
  )
}
