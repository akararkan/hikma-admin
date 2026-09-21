import React, { useState } from 'react'
import { StreamsApi } from '../../api'
import { useLoad, useAction, useDebounced, pageRows, fmtBytes } from '../../util'
import { DataTable, Pager, Err, Ok, Note, Loading, Field, Select, Tabs, KV, Modal, StatusBadge, Badge, Id, Tiles, PageIntro, HowTo } from '../../components/ui'
import FormModal from '../../components/FormModal'

export default function StreamsPage() {
  const [tab, setTab] = useState('fleet')
  return (
    <div>
      <PageIntro
        title="Live streams"
        lead="Watch over live video streams and act fast when something is wrong."
        bullets={[
          'You can see every stream — live now or already ended.',
          'You can stop a live stream right away.',
          'You can remove a guest from a stream.',
          'You can give the host a new stream key if the old one leaked.',
          'You can see recordings, check disk space, and delete a recording forever.',
        ]}
      />
      <Note>Privacy rule: stream keys are secret — the app never shows them to anyone, including you. Chat text inside a live stream is never saved: there is no way to read it later.</Note>
      <Tabs tabs={[
        { id: 'fleet', label: 'All streams' },
        { id: 'recordings', label: 'Recordings & disk space' },
        { id: 'gifts', label: 'Gifts' },
      ]} active={tab} onChange={setTab} />
      {tab === 'fleet' && <Fleet />}
      {tab === 'recordings' && <Recordings />}
      {tab === 'gifts' && <Gifts />}
    </div>
  )
}

function Fleet() {
  const [f, setF] = useState({ status: undefined, hostId: '' })
  const [page, setPage] = useState(0)
  const set = (patch) => { setPage(0); setF((s) => ({ ...s, ...patch })) }
  const df = useDebounced(f, 300)
  const { data, err, loading, reload } = useLoad(
    () => StreamsApi.list({ status: df.status, hostId: df.hostId || undefined, page, size: 25 }),
    [JSON.stringify(df), page]
  )
  const act = useAction()
  const [detail, setDetail] = useState(null)
  const [modal, setModal] = useState(null)
  const done = (msg) => { act.setOk(msg); reload(); setDetail(null) }

  const openDetail = async (r) => {
    const d = await act.run(() => StreamsApi.detail(r.id))
    if (d) setDetail(d)
  }

  return (
    <div>
      <HowTo steps={[
        'Pick "On air right now (LIVE)" in the status box to see only streams that are on right now.',
        'Click "See details" on a row to see the guests and the recording.',
        'A live stream with an open report is the most urgent thing on this platform — act fast.',
        'Red buttons are serious. The app asks for your password again (step-up) before they run.',
      ]} />
      <div className="filters">
        <Field label="Status"><Select value={f.status} onChange={(v) => set({ status: v })} options={[{ value: 'LIVE', label: 'On air right now (LIVE)' }, { value: 'ENDED', label: 'Already over (ENDED)' }]} /></Field>
        <Field label="Host's user id"><input className="w-id" value={f.hostId} onChange={(e) => set({ hostId: e.target.value })} /></Field>
        <button className="secondary" onClick={reload} title="GET /api/v1/admin/streams">Refresh the list</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'title', label: 'Stream name', render: (r) => <strong>{r.title}</strong> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'viewerCount', label: 'Watching now' },
          { key: 'peakViewerCount', label: 'Most at once' },
          { key: 'recordingStatus', label: 'Recording' },
          { key: 'startedAt', label: 'Started' },
          { key: 'endedAt', label: 'Ended' },
          { key: 'hostId', label: 'Host', render: (r) => <Id v={r.hostId} /> },
          {
            key: '_', label: 'What you can do', render: (r) => (
              <span className="row-actions">
                <button className="small secondary" onClick={(e) => { e.stopPropagation(); openDetail(r) }} title="GET /api/v1/admin/streams/{id}">See details</button>
                {r.status === 'LIVE' && <button className="small danger" onClick={(e) => { e.stopPropagation(); setModal({ kind: 'forceStop', r }) }} title="POST /api/v1/admin/streams/{id}/force-stop">Stop this stream now</button>}
                <button className="small danger" onClick={(e) => { e.stopPropagation(); setModal({ kind: 'rotate', r }) }} title="POST /api/v1/admin/streams/{id}/rotate-key">Give host a new key</button>
              </span>
            )
          },
        ]}
        rows={pageRows(data)}
        loading={loading}
        empty="No streams match. Nothing to watch over right now."
      />
      <Pager data={data} page={page} onPage={setPage} />

      {detail && (
        <Modal title={`Stream — ${detail.stream?.title}`} onClose={() => setDetail(null)} wide>
          <KV obj={detail.stream} />
          <h3>Guests on stage right now</h3>
          <p className="modal-lead">You see each guest's stream path. Their secret key is never shown.</p>
          <DataTable
            columns={[
              { key: 'userId', label: 'Guest', render: (r) => <Id v={r.userId} /> },
              { key: 'muted', label: 'Muted' },
              { key: 'publishPath', label: 'Stream path', render: (r) => <code>{r.publishPath}</code> },
              { key: '_', label: '', render: (r) => <button className="small danger" onClick={() => setModal({ kind: 'removeGuest', r: detail.stream, guest: r })} title="DELETE /api/v1/admin/streams/{id}/stage/{userId}">Remove this guest</button> },
            ]}
            rows={detail.activeGuests || []}
            empty="No guests on stage."
          />
          <h3>Recording</h3>
          <KV obj={detail.recording ? { 'has a recording': detail.recording.exists, 'size on disk': fmtBytes(detail.recording.totalBytes) } : { 'has a recording': false }} />
          <div className="row mt-2">
            <button className="small secondary" title="GET /api/v1/admin/streams/{id}/recording" onClick={async () => {
              const rec = await act.run(() => StreamsApi.recording(detail.stream.id), 'Recording facts loaded. This read is saved in the action history.')
              if (rec) setDetail((d) => ({ ...d, recordingMeta: rec }))
            }}>See recording facts (extra password check)</button>
            <button className="small danger" onClick={() => setModal({ kind: 'deleteRecording', r: detail.stream })} title="DELETE /api/v1/admin/streams/{id}/recording">Delete recording forever</button>
          </div>
          {detail.recordingMeta && <KV obj={detail.recordingMeta} />}
        </Modal>
      )}

      {modal?.kind === 'forceStop' && (
        <FormModal title={`Stop "${modal.r.title}" now`} danger requireText="STOP"
          intro="This ends the stream for everyone right away. The host and all guests are cut off, and the host gets a message. Know this: a host who streams with a computer program (OBS, RTMP) may stay connected a little longer — that fix is still coming. The app will ask for your password again (step-up)."
          fields={[
            { name: 'reason', label: 'Why are you stopping it?', type: 'textarea' },
            { name: 'reportId', label: 'Report id, if a report led you here (optional)' },
          ]}
          submitLabel="Stop this stream now"
          onSubmit={async (v) => { await StreamsApi.forceStop(modal.r.id, v); done('Stream stopped. The host was told.') }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'rotate' && (
        <FormModal title={`Give a new stream key — "${modal.r.title}"`} danger requireText="ROTATE"
          intro="Only ADMIN staff can do this. The old key stops working right away and the current broadcast is cut off. The app sends the new key to the host only — nobody else ever sees it, not even you. The app will ask for your password again (step-up)."
          fields={[{ name: 'reason', label: 'Why does the host need a new key? (for example: the old one leaked)', type: 'textarea' }]}
          submitLabel="Give host a new key"
          onSubmit={async (v) => { await StreamsApi.rotateKey(modal.r.id, v); done('New key sent to the host. Only the host can see it.') }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'removeGuest' && (
        <FormModal title="Remove this guest from the stage" danger
          intro="The guest is cut off right away. It is safe to click even if they already left. The app will ask for your password again (step-up)."
          fields={[{ name: 'reason', label: 'Why are you removing them?', type: 'textarea' }]}
          submitLabel="Remove this guest"
          onSubmit={async (v) => { await StreamsApi.removeGuest(modal.r.id, modal.guest.userId, v); done('Guest removed from the stage.') }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'deleteRecording' && (
        <FormModal title="Delete this recording forever" danger requireText="DELETE"
          intro="This deletes the recording files forever. They are the only copy. You cannot undo this. The app will ask for your password again (step-up)."
          fields={[
            { name: 'reason', label: 'Why are you deleting it? (for example: a copyright case number (DMCA))', type: 'textarea' },
            { name: 'reportId', label: 'Report id, if a report led you here (optional)' },
          ]}
          submitLabel="Delete recording forever"
          onSubmit={async (v) => { await StreamsApi.deleteRecording(modal.r.id, v); done('Recording deleted forever.') }}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function Recordings() {
  const act = useAction()
  const [data, setData] = useState(null)
  const [modal, setModal] = useState(null)
  const load = async (okMsg) => {
    const r = await act.run(() => StreamsApi.recordingsFleet(100), okMsg || 'List loaded. This read is saved in the action history.')
    if (r) setData(r)
  }
  return (
    <div className="card">
      <HowTo steps={[
        'Click the button below to load the list. The app asks for your password again (step-up), because recordings are close to real content.',
        'The biggest recordings are at the top — they use the most disk space.',
        'A "left-over" row is a folder on disk with no stream attached. It is a good one to clean up.',
        'Use "Delete forever" to free disk space. There is no undo.',
      ]} />
      <button disabled={act.busy} onClick={() => load()} title="GET /api/v1/admin/streams/recordings">Load the recordings list (extra password check)</button>
      <Err e={act.err} /><Ok msg={act.ok} />
      {data && (
        <>
          <Tiles items={[
            { label: 'Recordings on disk', value: data.recordings },
            { label: 'Total disk space used', value: fmtBytes(data.fleetBytes) },
          ]} />
          {data.note && <Note>{data.note}</Note>}
          <DataTable
            columns={[
              { key: 'streamId', label: 'Stream', render: (r) => <Id v={r.streamId} /> },
              { key: 'bytes', label: 'Size', render: (r) => fmtBytes(r.bytes) },
              { key: 'parts', label: 'File parts' },
              { key: 'status', label: 'Stream status' },
              { key: 'startedAt', label: 'Stream started' },
              { key: 'orphan', label: 'Left-over?', render: (r) => r.orphan ? <Badge kind="err">left-over (orphan)</Badge> : null },
              {
                key: '_', label: '', render: (r) => r.orphan
                  ? <span className="muted" title="No stream row exists, so the delete endpoint cannot target it.">no stream attached</span>
                  : <button className="small danger" onClick={() => setModal(r)} title="DELETE /api/v1/admin/streams/{id}/recording">Delete forever</button>
              },
            ]}
            rows={data.rows || []}
            rowKey={(r) => r.streamId}
            empty="No recordings on disk. Nothing is using space."
          />
        </>
      )}
      {modal && (
        <FormModal title="Delete this recording forever" danger requireText="DELETE"
          intro="This deletes the recording files forever. They are the only copy. You cannot undo this. The app will ask for your password again (step-up)."
          fields={[
            { name: 'reason', label: 'Why are you deleting it?', type: 'textarea' },
            { name: 'reportId', label: 'Report id, if a report led you here (optional)' },
          ]}
          submitLabel="Delete recording forever"
          onSubmit={async (v) => { await StreamsApi.deleteRecording(modal.streamId, v); setModal(null); await load('Recording deleted forever. List reloaded.') }}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function Gifts() {
  const { data, err, loading, reload } = useLoad(() => StreamsApi.giftsTop(20), [])
  return (
    <div className="card">
      <HowTo steps={[
        'Look at the table to see who gave the most coins.',
        'The tile shows all coins ever gifted.',
        'Click "Refresh the list" to get the newest numbers.',
      ]} />
      <Note>Gifts are just for fun — the coins are points, not real money. Nobody pays or gets paid.</Note>
      <button className="secondary small" onClick={reload} title="GET /api/v1/admin/streams/gifts/top">Refresh the list</button>
      <Err e={err} /><Loading on={loading} />
      {data && (
        <>
          <Tiles items={[{ label: 'Coins ever gifted (all time)', value: data.totalCoins }]} />
          <DataTable
            columns={[
              { key: 'userId', label: 'Who gave the most', render: (r) => <Id v={r.userId} /> },
              { key: 'coins', label: 'Coins' },
              { key: 'gifts', label: 'Number of gifts' },
            ]}
            rows={data.topGifters || []}
            loading={loading}
            empty="Nobody has sent a gift yet."
          />
        </>
      )}
    </div>
  )
}
