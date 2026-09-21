import React, { useState } from 'react'
import { ChatApi } from '../../api'
import { useLoad, useDebounced, pageRows } from '../../util'
import { DataTable, Pager, Err, Note, Loading, Field, Select, Tabs, KV, Tiles, StatusBadge, Id, PageIntro, HowTo } from '../../components/ui'

export default function ChatPage() {
  const [tab, setTab] = useState('overview')
  return (
    <div>
      <PageIntro
        title="Chat overview"
        lead="See facts and numbers about chats, calls, and message requests."
        bullets={[
          'You can see how many chats of each kind exist.',
          'You can browse groups and channels — names and numbers only.',
          'You can see call numbers: how many were answered or missed.',
          'You can spot spam senders in the message-request numbers.',
        ]}
      />
      <Note>Privacy rule: we never show what people wrote. You only see facts and numbers (metadata). Private 1-to-1 chats (DMs) are never listed — only counted.</Note>
      <Tabs tabs={[
        { id: 'overview', label: 'Totals' },
        { id: 'conversations', label: 'Groups & channels' },
        { id: 'calls', label: 'Calls' },
        { id: 'requests', label: 'Message requests' },
      ]} active={tab} onChange={setTab} />
      {tab === 'overview' && <Overview />}
      {tab === 'conversations' && <Conversations />}
      {tab === 'calls' && <Calls />}
      {tab === 'requests' && <MessageRequests />}
    </div>
  )
}

function Overview() {
  const { data, err, loading } = useLoad(() => ChatApi.overview(), [])
  return (
    <div>
      <HowTo steps={[
        'The tiles show how many chats of each kind exist.',
        '1-to-1 chats (DMs) are only counted. There is no list of them, anywhere.',
        'Use the other tabs to browse groups and channels, calls, and message requests.',
      ]} />
      <div className="card">
        <Err e={err} /><Loading on={loading} />
        {data && (
          <>
            <Tiles items={[
              ...Object.entries(data.conversationsByType || {}).map(([k, v]) => ({
                label: k === 'DIRECT' ? '1-to-1 chats (DMs)' : k === 'GROUP' ? 'Group chats' : k === 'CHANNEL' ? 'Channels' : `${k} chats`,
                value: v,
              })),
              { label: 'Channels with a verified badge', value: data.verifiedChannels },
              { label: 'Message requests waiting', value: data.pendingMessageRequests },
            ]} />
            <Note>The 1-to-1 (DM) number is a count only. There is no list of DMs anywhere. This protects people's privacy.</Note>
          </>
        )}
      </div>
    </div>
  )
}

function Conversations() {
  const [f, setF] = useState({ type: 'CHANNEL', q: '', ownerId: '', includeDeleted: false })
  const [page, setPage] = useState(0)
  const set = (patch) => { setPage(0); setF((s) => ({ ...s, ...patch })) }
  const df = useDebounced(f, 300)
  const { data, err, loading, reload } = useLoad(
    () => ChatApi.conversations({ type: df.type, q: df.q || undefined, ownerId: df.ownerId || undefined, includeDeleted: df.includeDeleted, page, size: 25 }),
    [JSON.stringify(df), page]
  )
  return (
    <div>
      <HowTo steps={[
        'Pick "Group chats" or "Channels" in the first box.',
        'Type part of the name in the search box, if you want. The list updates as you type.',
        'Click "Refresh the list" to load it again.',
        'You see names and numbers only — never message text.',
      ]} />
      <div className="filters">
        <Field label="Kind"><Select value={f.type} onChange={(v) => set({ type: v || 'CHANNEL' })} options={[{ value: 'GROUP', label: 'Group chats (GROUP)' }, { value: 'CHANNEL', label: 'Channels (CHANNEL)' }]} allowEmpty={false} /></Field>
        <Field label="Name or @name contains"><input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="type part of the name" /></Field>
        <Field label="Owner's user id"><input className="w-id" value={f.ownerId} onChange={(e) => set({ ownerId: e.target.value })} /></Field>
        <Field label="Also show removed ones"><input type="checkbox" checked={f.includeDeleted} onChange={(e) => set({ includeDeleted: e.target.checked })} /></Field>
        <button className="secondary" onClick={reload} title="GET /api/v1/admin/chat/conversations">Refresh the list</button>
      </div>
      <Err e={err} />
      <DataTable
        columns={[
          { key: 'title', label: 'Name' },
          { key: 'handle', label: '@name', render: (r) => r.handle ? `@${r.handle}` : null },
          { key: 'type', label: 'Kind' },
          { key: 'publicChannel', label: 'Public' },
          { key: 'verified', label: 'Verified badge' },
          { key: 'memberCount', label: 'Members' },
          { key: 'postCount', label: 'Posts' },
          { key: 'ownerId', label: 'Owner', render: (r) => <Id v={r.ownerId} /> },
          { key: 'createdAt', label: 'Made on' },
          { key: 'deletedAt', label: 'Removed on' },
        ]}
        rows={pageRows(data)}
        loading={loading}
        empty="No groups or channels match. Note: 1-to-1 chats (DMs) never show here — that is by design."
      />
      <Pager data={data} page={page} onPage={setPage} />
    </div>
  )
}

function Calls() {
  const [f, setF] = useState({ type: undefined, status: undefined, from: '', to: '' })
  const [page, setPage] = useState(0)
  const set = (patch) => { setPage(0); setF((s) => ({ ...s, ...patch })) }
  const list = useLoad(() => ChatApi.calls({ ...f, from: f.from || undefined, to: f.to || undefined, page, size: 25 }), [JSON.stringify(f), page])
  const stats = useLoad(() => ChatApi.callStats({ from: f.from || undefined, to: f.to || undefined }), [f.from, f.to])
  const s = stats.data
  return (
    <div>
      <Note>Calls go straight between the two phones (P2P). We never have the sound or video — only the facts below.</Note>
      <HowTo steps={[
        'The tiles show call numbers for the chosen dates (last 30 days if empty).',
        'Use the boxes to filter the call list: voice or video, and the outcome.',
        'Pick "From" and "To" dates to look at a different time window.',
      ]} />
      {s && (
        <Tiles items={[
          { label: 'Calls in this window', value: s.total },
          { label: 'Answered (%)', value: `${s.answerRate}%` },
          { label: 'Missed (%)', value: `${s.missedRate}%` },
          ...Object.entries(s.byType || {}).map(([k, v]) => ({ label: k === 'VOICE' ? 'Voice calls' : k === 'VIDEO' ? 'Video calls' : `${k} calls`, value: v })),
        ]} />
      )}
      {s?.byStatus && <div className="card"><h2>Calls by outcome (raw status names)</h2><KV obj={s.byStatus} /></div>}
      <div className="filters">
        <Field label="Voice or video"><Select value={f.type} onChange={(v) => set({ type: v })} options={[{ value: 'VOICE', label: 'Voice calls (VOICE)' }, { value: 'VIDEO', label: 'Video calls (VIDEO)' }]} /></Field>
        <Field label="Outcome"><Select value={f.status} onChange={(v) => set({ status: v })} options={[
          { value: 'RINGING', label: 'Still ringing (RINGING)' },
          { value: 'ONGOING', label: 'Happening now (ONGOING)' },
          { value: 'ENDED', label: 'Ended normally (ENDED)' },
          { value: 'DECLINED', label: 'The other person said no (DECLINED)' },
          { value: 'MISSED', label: 'Nobody answered (MISSED)' },
          { value: 'CANCELLED', label: 'The caller gave up first (CANCELLED)' },
        ]} /></Field>
        <Field label="From"><input type="datetime-local" value={f.from} onChange={(e) => set({ from: e.target.value })} /></Field>
        <Field label="To"><input type="datetime-local" value={f.to} onChange={(e) => set({ to: e.target.value })} /></Field>
      </div>
      <Err e={list.err} />
      <DataTable
        columns={[
          { key: 'startedAt', label: 'When it started' },
          { key: 'type', label: 'Voice or video' },
          { key: 'status', label: 'Outcome', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'endReason', label: 'Why it ended' },
          { key: 'answeredAt', label: 'Answered at' },
          { key: 'endedAt', label: 'Ended at' },
          { key: 'initiatorId', label: 'Who called', render: (r) => <Id v={r.initiatorId} /> },
        ]}
        rows={pageRows(list.data)}
        loading={list.loading}
        empty="No calls found for these filters."
      />
      <Pager data={list.data} page={page} onPage={setPage} />
    </div>
  )
}

function MessageRequests() {
  const [f, setF] = useState({ from: '', to: '', top: 20 })
  const { data, err, loading, reload } = useLoad(
    () => ChatApi.messageRequestStats({ from: f.from || undefined, to: f.to || undefined, topRequesters: f.top || 20 }),
    [JSON.stringify(f)]
  )
  return (
    <div className="card">
      <Note>A message request is a first message from a stranger. It waits until the person says yes or no. People who get blocked by many strangers are very likely spammers.</Note>
      <HowTo steps={[
        'Look at the "possible spam senders" table below.',
        'A high number in the last column means many different people blocked that sender.',
        'Copy the user id and check them on the "All users" page, or open a report on the "User reports" page.',
      ]} />
      <div className="filters">
        <Field label="From"><input type="datetime-local" value={f.from} onChange={(e) => setF((s) => ({ ...s, from: e.target.value }))} /></Field>
        <Field label="To"><input type="datetime-local" value={f.to} onChange={(e) => setF((s) => ({ ...s, to: e.target.value }))} /></Field>
        <Field label="How many senders to show"><input type="number" min="1" max="100" value={f.top} onChange={(e) => setF((s) => ({ ...s, top: e.target.value }))} /></Field>
        <button className="secondary" onClick={reload} title="GET /api/v1/admin/chat/message-requests/stats">Refresh the list</button>
      </div>
      <Err e={err} /><Loading on={loading} />
      {data && (
        <>
          <h3>All time (every message request ever)</h3><KV obj={data.funnelAllTime} />
          <h3>In this time window (last 30 days if empty)</h3><KV obj={data.windowed} />
          <h3>Possible spam senders</h3>
          <DataTable
            columns={[
              { key: 'requesterId', label: 'Who sent the requests', render: (r) => <code>{r.requesterId}</code> },
              { key: 'blockedByDistinctRecipients', label: 'How many different people blocked them' },
            ]}
            rows={data.topBlockedRequesters || []}
            loading={loading}
            empty="No one stands out. Nothing to do here right now."
          />
        </>
      )}
    </div>
  )
}
