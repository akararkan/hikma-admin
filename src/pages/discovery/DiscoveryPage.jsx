import React, { useState } from 'react'
import { DiscoveryApi } from '../../api'
import { useLoad, useAction, fmtNum } from '../../util'
import { DataTable, Err, Ok, Note, Warn, Loading, Field, Tabs, KV, JsonBlock, Tiles, PageIntro, HowTo, Id } from '../../components/ui'
import FormModal from '../../components/FormModal'

export default function DiscoveryPage() {
  const [tab, setTab] = useState('stats')
  return (
    <div>
      <PageIntro
        title="Privacy tools"
        lead="Check and control how people can find each other in the app."
        bullets={[
          'You can see numbers about contact syncing (address-book matching).',
          'You can find users who have contact data but no consent record.',
          'You can check one user\'s find-me settings and QR code.',
          'You can rebuild and view one user\'s friend suggestions (PYMK).',
          'You can delete one user\'s contact data forever (GDPR).',
        ]}
      />
      <HowTo steps={[
        'Open the "Contact numbers" tab to see how much contact data the app holds.',
        'Open the "Consent check" tab and click "Run the check" to find users with contact data but no consent.',
        'Open the "One user" tab, paste a user id, and use the buttons to check or fix that user.',
      ]} />
      <Tabs tabs={[
        { id: 'stats', label: 'Contact numbers' },
        { id: 'compliance', label: 'Consent check' },
        { id: 'user', label: 'One user' },
      ]} active={tab} onChange={setTab} />
      {tab === 'stats' && <Stats />}
      {tab === 'compliance' && <Compliance />}
      {tab === 'user' && <PerUser />}
    </div>
  )
}

function Stats() {
  const { data, err, loading, reload } = useLoad(() => DiscoveryApi.contactSyncStats(), [])
  return (
    <div className="card">
      <Note>Users sync their phone contacts to find friends. The app only ever stores scrambled codes (SHA-256 hashes) of phone numbers and emails — never the real contacts.</Note>
      <Warn>
        Reading these numbers: matching by phone number only started working on 11 August 2026.
        Before that, phone codes were stored but matched nobody, so older counts look busy while
        almost every match came from email. Also, a phone number checked before that day may be
        saved in the wrong shape (an extra 0 after the country code) and will never match — those
        people need to check their phone number again in the app.
      </Warn>
      <button className="small secondary" onClick={reload} title="GET /api/v1/admin/discovery/contact-sync/stats">Refresh the list</button>
      <Err e={err} /><Loading on={loading} />
      {data && (
        <>
          <Tiles items={[
            { value: fmtNum(data.contactHashRows), label: 'Stored contact codes (hashes)' },
            { value: fmtNum(data.usersWithSyncedContacts), label: 'Users who synced contacts' },
            { value: fmtNum(data.identityHashRows), label: 'Account identity codes' },
            { value: fmtNum(data.capPerSync), label: 'Most codes allowed per sync (limit)' },
          ]} />
          <h3>Users close to the limit</h3>
          <Note>A user who uploads close to {fmtNum(data.capPerSync || 5000)} codes again and again may be collecting other people's contact details. Tell the safety team if this looks wrong.</Note>
          <DataTable
            columns={[
              { key: 'ownerId', label: 'Which user', render: (r) => <Id v={r.ownerId} /> },
              { key: 'hashes', label: 'How many codes' },
            ]}
            rows={data.ownersNearCap || []}
            loading={loading}
            empty="Nobody is close to the limit. Nothing to worry about here."
          />
          {(data.notes || []).map((n, i) => <Note key={i}>{n}</Note>)}
        </>
      )}
    </div>
  )
}

function Compliance() {
  const act = useAction()
  const [scanLimit, setScanLimit] = useState(500)
  const [result, setResult] = useState(null)
  const [showAll, setShowAll] = useState(false)
  return (
    <div className="card">
      <Note>This check finds users who have synced contact data but NO active "share my contacts" permission (consent). That is a problem we must fix. The app will ask for your password again (step-up), and the read is saved in the action history.</Note>
      <HowTo steps={[
        'Choose how many users to scan (up to 2000).',
        'Click "Run the check". Enter your password again if the app asks.',
        'If the result says the scan stopped early, raise the number and run it again.',
        'For each user in the list: ask them to sync again with consent, or delete their contact data on the "One user" tab.',
      ]} />
      <div className="filters">
        <Field label="How many users to scan (up to 2000)"><input type="number" min={1} max={2000} value={scanLimit} onChange={(e) => setScanLimit(Number(e.target.value) || 500)} /></Field>
        <button disabled={act.busy} title="GET /api/v1/admin/discovery/contact-sync/compliance" onClick={async () => {
          const r = await act.run(() => DiscoveryApi.compliance(scanLimit), 'Check finished. The read was saved in the action history.')
          if (r) { setResult(r); setShowAll(false) }
        }}>Run the check</button>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      {result && (
        <>
          <KV obj={{ 'Users scanned': result.ownersScanned, 'Scan stopped early?': result.scanTruncated }} />
          {result.scanTruncated && <Warn>The scan stopped before checking everyone. Raise the number and run it again.</Warn>}
          <h3>Users with contact data but no consent</h3>
          {result.ownersWithoutActiveConsent?.length
            ? (
              <>
                <div className="row tight">
                  {/* Click-to-copy: the HowTo tells admins to paste each id into the One-user tab. */}
                  {result.ownersWithoutActiveConsent.slice(0, showAll ? undefined : 200).map((id) => (
                    <Id key={id} v={id} />
                  ))}
                </div>
                {!showAll && result.ownersWithoutActiveConsent.length > 200 && (
                  <button className="small secondary mt-2" onClick={() => setShowAll(true)}>Show more</button>
                )}
              </>
            )
            : <div className="banner ok">Good news: every scanned user has an active consent. Nothing to fix.</div>}
        </>
      )}
    </div>
  )
}

function PerUser() {
  const act = useAction()
  const [userId, setUserId] = useState('')
  const [flags, setFlags] = useState(null)
  const [suggestions, setSuggestions] = useState(null)
  const [qr, setQr] = useState(null)
  const [purgeOpen, setPurgeOpen] = useState(false)

  return (
    <div className="card">
      <HowTo steps={[
        'Paste the user id in the box.',
        'Click "Show find-me settings" to see how people can find this user.',
        'Click "Rebuild friend suggestions", wait a moment, then click "Show friend suggestions" to see the new list.',
        'Click "Reset the QR code" if the user\'s QR code was shared or misused — the old code stops working right away.',
        'Click "Delete contact data forever" only for a GDPR (right to be forgotten) request.',
      ]} />
      <div className="filters">
        <Field label="User id *"><input value={userId} onChange={(e) => setUserId(e.target.value)} className="w-id" placeholder="Paste the user id here" /></Field>
      </div>
      <div className="toolbar">
        <button className="secondary" disabled={!userId || act.busy} title="GET /api/v1/admin/users/{userId}/discovery" onClick={async () => {
          const r = await act.run(() => DiscoveryApi.flags(userId), 'Settings loaded.')
          if (r) setFlags(r)
        }}>Show find-me settings</button>
        <button className="secondary" disabled={!userId || act.busy} title="POST /api/v1/admin/users/{userId}/suggestions/recompute" onClick={async () => {
          await act.run(() => DiscoveryApi.recompute(userId), 'Rebuild started. It runs in the background — click "Show friend suggestions" in a moment.')
        }}>Rebuild friend suggestions</button>
        <button className="secondary" disabled={!userId || act.busy} title="GET /api/v1/admin/users/{userId}/suggestions" onClick={async () => {
          const r = await act.run(() => DiscoveryApi.suggestions(userId), 'Suggestions loaded. This read shows private data, so it was saved in the action history.')
          if (r) setSuggestions(r)
        }}>Show friend suggestions</button>
        <button className="secondary" disabled={!userId || act.busy} title="POST /api/v1/admin/users/{userId}/qr/rotate" onClick={async () => {
          const r = await act.run(() => DiscoveryApi.rotateQr(userId), 'New QR code made. The old code stopped working right away.')
          if (r) setQr(r)
        }}>Reset the QR code</button>
        <button className="danger" disabled={!userId} title="POST /api/v1/admin/users/{userId}/contact-hashes/purge" onClick={() => setPurgeOpen(true)}>Delete contact data forever…</button>
      </div>
      <Err e={act.err} /><Ok msg={act.ok} />
      {flags && (
        <>
          <h3>Find-me settings</h3>
          {/* This used to warn that turning off "find me by QR code" does not
              stop old codes — repeating the `knownSeam` string the backend
              still ships on this payload. Both were out of date, and checked
              against a running server on 2026-08-11: QrDiscoveryController
              calls isDiscoverableBy(userId, QR) before resolving and answers
              404 when the flag is off (404 rather than 403, so the response
              cannot be used to probe the setting). Telling an operator that a
              working privacy control is broken is the expensive direction of
              this mistake — they reach for the irreversible button instead. */}
          <Note>Turning off "can be found by QR code" stops every existing code straight away, and turning it back on makes them work again. "Reset the QR code" is the permanent version: it retires one specific printed code for good.</Note>
          {flags.knownSeam && !/QR-resolve does not/i.test(flags.knownSeam) && <Note>{flags.knownSeam}</Note>}
          <KV obj={{
            'Can be found by username?': flags.byUsername,
            'Can be found by phone number?': flags.byPhone,
            'Can be found by email?': flags.byEmail,
            'Can be found by QR code?': flags.byQr,
            'Shown in search results?': flags.indexable,
            'Has a working QR code?': flags.qrTokenActive,
            'QR code last reset on': flags.qrRotatedAt || '(never)',
          }} />
        </>
      )}
      {qr && (
        <>
          <h3>New QR code value</h3>
          <Note>This is the new secret value behind the user's QR code. The old value stopped working.</Note>
          <JsonBlock v={qr} />
        </>
      )}
      {suggestions && (
        <>
          <h3>Friend suggestions we stored for this user</h3>
          <DataTable
            columns={[
              { key: 'candidateId', label: 'Who we suggest', render: (r) => <Id v={r.candidateId} /> },
              { key: 'storedScore', label: 'Match score' },
              { key: 'reason', label: 'Why suggested' },
              { key: 'computedAt', label: 'Made on' },
            ]}
            rows={suggestions.suggestions || []}
            empty="No stored suggestions. Try the rebuild button first."
          />
          <h3>People this user said no to</h3>
          {suggestions.dismissedCandidateIds?.length
            ? <div className="row tight">{suggestions.dismissedCandidateIds.map((id) => <Id key={id} v={id} />)}</div>
            : <span className="muted">None. This user has not dismissed anyone.</span>}
        </>
      )}
      {purgeOpen && (
        <FormModal title="Delete contact data forever (GDPR)" danger requireText="PURGE"
          intro="This deletes ALL of this user's contact codes — the ones they uploaded AND the app-made identity code. You cannot undo it. Friends can no longer find this user by contacts until the user syncs again. The app will ask for your password again (step-up)."
          fields={[]}
          submitLabel="Delete forever"
          onSubmit={async () => {
            const r = await DiscoveryApi.purgeHashes(userId)
            act.setOk(`Deleted ${r?.deleted ?? 0} contact code(s). This cannot be undone.`)
          }}
          onClose={() => setPurgeOpen(false)} />
      )}
    </div>
  )
}
