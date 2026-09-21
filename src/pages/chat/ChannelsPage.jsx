import React, { useState } from 'react'
import { ChannelsApi } from '../../api'
import { useLoad, useAction, useDebounced, pageRows } from '../../util'
import { DataTable, Pager, Err, Ok, Note, Field, Select, Modal, KV, Badge, Id, SeriesBars, PageIntro, HowTo } from '../../components/ui'
import FormModal from '../../components/FormModal'

export default function ChannelsPage() {
  const [f, setF] = useState({ q: '', verified: undefined, public: undefined, category: '', ownerId: '', includeDeleted: false })
  const [page, setPage] = useState(0)
  const set = (patch) => { setPage(0); setF((s) => ({ ...s, ...patch })) }
  const df = useDebounced(f, 300)
  const { data, err, loading, reload } = useLoad(
    () => ChannelsApi.list({
      q: df.q || undefined, verified: df.verified, public: df.public, category: df.category || undefined,
      ownerId: df.ownerId || undefined, includeDeleted: df.includeDeleted, page, size: 25,
    }),
    [JSON.stringify(df), page]
  )
  const act = useAction()
  const [inspect, setInspect] = useState(null) // {row, stats, invites}
  const [modal, setModal] = useState(null)
  const done = (msg) => { act.setOk(msg); reload() }

  const openInspect = async (row) => {
    const [detail, stats, invites] = await Promise.all([
      act.run(() => ChannelsApi.detail(row.id)),
      act.run(() => ChannelsApi.stats(row.id)),
      act.run(() => ChannelsApi.inviteLinks(row.id)),
    ])
    setInspect({ row: detail || row, stats, invites })
  }

  return (
    <div>
      <PageIntro
        title="Channels"
        lead="Find any channel, see its numbers, and act on bad ones."
        bullets={[
          'You can search all channels by name.',
          'You can see a channel’s numbers: members, posts, joins per day.',
          'You can give or take away the verified badge.',
          'You can stop new posts (freeze), hide a channel from discovery, or remove it from the app.',
          'You can cancel an invite link that spammers are sharing.',
        ]}
      />
      <HowTo steps={[
        'Type part of the channel name in the search box. The list updates as you type.',
        'You can give or take away the verified badge right on the row.',
        'Click "See details" on a row to open its numbers, invite links, and all other action buttons.',
        'Serious buttons have a red outline. For those, the app asks for your password again (step-up).',
      ]} />
      <Note>Privacy rule: we never show what people wrote in the channel. Invite links show only a scrambled code (hash) — the real link cannot be read here.</Note>
      <div className="filters">
        <Field label="Name or @name contains"><input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="type part of the name" /></Field>
        <Field label="Verified badge"><Select value={f.verified} onChange={(v) => set({ verified: v })} options={[{ value: 'true', label: 'has badge' }, { value: 'false', label: 'no badge' }]} /></Field>
        <Field label="Public"><Select value={f.public} onChange={(v) => set({ public: v })} options={[{ value: 'true', label: 'public' }, { value: 'false', label: 'private' }]} /></Field>
        <Field label="Category"><input value={f.category} onChange={(e) => set({ category: e.target.value })} /></Field>
        <Field label="Owner's user id"><input className="w-id" value={f.ownerId} onChange={(e) => set({ ownerId: e.target.value })} /></Field>
        <Field label="Also show removed ones"><input type="checkbox" checked={f.includeDeleted} onChange={(e) => set({ includeDeleted: e.target.checked })} /></Field>
        <button className="secondary" onClick={reload} title="GET /api/v1/admin/channels">Refresh the list</button>
      </div>
      <Err e={err} /><Err e={act.err} /><Ok msg={act.ok} />
      <DataTable
        columns={[
          { key: 'title', label: 'Channel', render: (r) => <span><strong>{r.title}</strong> {r.handle && <span className="muted">@{r.handle}</span>}</span> },
          { key: 'verified', label: 'Verified badge' },
          { key: 'publicChannel', label: 'Public' },
          { key: 'frozenByAdmin', label: 'Posting stopped', render: (r) => r.frozenByAdmin ? <Badge kind="err">frozen</Badge> : null },
          { key: 'memberCount', label: 'Members' },
          { key: 'postCount', label: 'Posts' },
          { key: 'deletedAt', label: 'Removed on' },
          {
            key: '_', label: 'What you can do', render: (r) => (
              <span className="row-actions">
                <button className="small secondary" onClick={(e) => { e.stopPropagation(); openInspect(r) }} title="GET /api/v1/admin/channels/{id} + /stats + /invite-links">See details</button>
                <button className="small secondary" title="PATCH /api/v1/admin/channels/{id}/verified"
                  onClick={async (e) => { e.stopPropagation(); await act.run(() => ChannelsApi.setVerified(r.id, !r.verified), r.verified ? 'Verified badge taken away.' : 'Verified badge given.'); reload() }}>
                  {r.verified ? 'Take away badge' : 'Give verified badge'}
                </button>
              </span>
            )
          },
        ]}
        rows={pageRows(data)}
        loading={loading}
        empty="No channels match your search. Try fewer filters."
      />
      <Pager data={data} page={page} onPage={setPage} />

      {inspect && (
        <Modal title={`Channel — ${inspect.row?.title}`} onClose={() => setInspect(null)} wide>
          <div className="grid2">
            <div><h3>Channel facts</h3><KV obj={inspect.row} /></div>
            <div>
              <h3>Numbers</h3>
              <p className="modal-lead">You see these even if you are not a member of the channel.</p>
              {inspect.stats ? <KV obj={{
                'members': inspect.stats.subscriberCount,
                'online now': inspect.stats.onlineSubscribers,
                'joined last 7 days': inspect.stats.joinedLast7Days,
                'joined last 30 days': inspect.stats.joinedLast30Days,
                'left last 30 days': inspect.stats.leftLast30Days,
                'members who muted it': inspect.stats.mutedCount,
                'posts': inspect.stats.postCount,
                'total views': inspect.stats.totalViews,
                'total shares (forwards)': inspect.stats.totalForwards,
              }} /> : <span className="muted">Numbers are not available right now.</span>}
            </div>
          </div>
          <h3>What you can do</h3>
          <div className="row">
            {!inspect.row?.deletedAt
              ? <button className="small danger" onClick={() => setModal({ kind: 'takedown', r: inspect.row })} title="POST /api/v1/admin/channels/{id}/takedown">Remove from the app</button>
              : <button className="small" onClick={async () => { await act.run(() => ChannelsApi.restore(inspect.row.id), 'Channel is back in the app.'); reload(); setInspect(null) }} title="POST /api/v1/admin/channels/{id}/restore">Put it back</button>}
            <button className="small secondary" onClick={() => setModal({ kind: 'unlist', r: inspect.row })} title="POST /api/v1/admin/channels/{id}/unlist">Hide from discovery</button>
            {inspect.row?.frozenByAdmin
              ? <button className="small" onClick={async () => { await act.run(() => ChannelsApi.unfreeze(inspect.row.id), 'People can post again.'); reload(); setInspect(null) }} title="POST /api/v1/admin/channels/{id}/unfreeze">Allow posts again</button>
              : <button className="small danger" onClick={() => setModal({ kind: 'freeze', r: inspect.row })} title="POST /api/v1/admin/channels/{id}/freeze">Stop new posts (freeze)</button>}
          </div>
          {inspect.stats?.joinsByDay && (
            <>
              <h3>New members per day (last 30 days)</h3>
              <SeriesBars series={inspect.stats.joinsByDay} />
            </>
          )}
          <div className="grid2">
            {inspect.stats?.joinsBySource && <div><h3>How members found the channel</h3><KV obj={inspect.stats.joinsBySource} /></div>}
            {inspect.stats?.postsByType && <div><h3>Posts by kind</h3><KV obj={inspect.stats.postsByType} /></div>}
          </div>
          {Array.isArray(inspect.stats?.topPosts) && inspect.stats.topPosts.length > 0 && (
            <>
              <h3>Most-viewed posts (numbers only)</h3>
              <DataTable
                columns={[
                  { key: 'messageId', label: 'Post id', render: (r) => <code>{String(r.messageId)}</code> },
                  { key: 'type', label: 'Kind' },
                  { key: 'views', label: 'Views' },
                  { key: 'forwards', label: 'Shares' },
                  { key: 'comments', label: 'Comments' },
                  { key: 'createdAt', label: 'Posted on' },
                ]}
                rows={inspect.stats.topPosts}
                rowKey={(r) => String(r.messageId)}
                empty="No posts yet."
              />
            </>
          )}
          <h3>Invite links</h3>
          <p className="modal-lead">Only the scrambled code (hash) is stored. Nobody can read the real link here.</p>
          <DataTable
            columns={[
              { key: 'tokenHash', label: 'Link code (scrambled)', render: (r) => <Id v={r.tokenHash} /> },
              { key: 'useCount', label: 'Times used' },
              { key: 'maxUses', label: 'Use limit', render: (r) => r.maxUses ?? 'no limit' },
              { key: 'expiresAt', label: 'Stops working on', render: (r) => r.expiresAt || 'never' },
              { key: 'requiresApproval', label: 'Needs a yes from channel staff' },
              { key: 'revoked', label: 'Cancelled' },
              { key: 'usable', label: 'Still works' },
              { key: '_', label: '', render: (r) => !r.revoked && <button className="small danger" onClick={() => setModal({ kind: 'revokeInvite', r: inspect.row, invite: r })} title="POST /api/v1/admin/channels/{id}/invite-links/{inviteId}/revoke">Cancel this link</button> },
            ]}
            rows={inspect.invites || []}
            empty="This channel has no invite links."
          />
        </Modal>
      )}

      {modal?.kind === 'takedown' && (
        <FormModal title={`Remove "${modal.r.title}" from the app`} danger requireText="REMOVE"
          intro="This hides the channel from everyone in the app. The owner gets a message about it. You can undo this later with the 'Put it back' button. The app will ask for your password again (step-up)."
          fields={[
            { name: 'reason', label: 'Why are you removing it? (up to 500 letters)', type: 'textarea' },
            { name: 'reportId', label: 'Report id, if a report led you here (optional)' },
          ]}
          submitLabel="Remove from the app"
          onSubmit={async (v) => { await ChannelsApi.takedown(modal.r.id, v); done('Channel removed from the app. The owner was told.'); setInspect(null) }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'unlist' && (
        <FormModal title={`Hide "${modal.r.title}" from discovery`}
          intro="The channel stops showing up in search and discovery. It keeps working, and members keep it. This does not delete anything."
          fields={[{ name: 'reason', label: 'Why are you hiding it?', type: 'textarea' }]}
          submitLabel="Hide from discovery"
          onSubmit={async (v) => { await ChannelsApi.unlist(modal.r.id, v); done('Channel hidden from search and discovery.'); setInspect(null) }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'freeze' && (
        <FormModal title={`Stop new posts in "${modal.r.title}"`} danger
          intro="Nobody can post in this channel any more — not even the owner. You can undo this with 'Allow posts again'. The app will ask for your password again (step-up)."
          fields={[
            { name: 'reason', label: 'Why are you stopping posts?', type: 'textarea' },
            { name: 'reportId', label: 'Report id, if a report led you here (optional)' },
          ]}
          submitLabel="Stop new posts"
          onSubmit={async (v) => { await ChannelsApi.freeze(modal.r.id, v); done('Posting is stopped in this channel.'); setInspect(null) }}
          onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'revokeInvite' && (
        <FormModal title="Cancel this invite link" danger
          intro="The link stops working right away for everyone who has it. You cannot turn the same link back on."
          fields={[{ name: 'reason', label: 'Why are you cancelling it?', type: 'textarea' }]}
          submitLabel="Cancel this link"
          onSubmit={async (v) => { await ChannelsApi.revokeInvite(modal.r.id, modal.invite.id, v); done('Invite link cancelled.'); setInspect(null) }}
          onClose={() => setModal(null)} />
      )}
    </div>
  )
}
