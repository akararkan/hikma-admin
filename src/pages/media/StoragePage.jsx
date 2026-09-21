import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { StorageApi, MediaApi } from '../../api'
import { useLoad, fmtBytes } from '../../util'
import { DataTable, Err, Note, Loading, Tiles, Field, PageIntro, HowTo, Id } from '../../components/ui'
import { STATUS_LABELS } from './labels'

export default function StoragePage() {
  const [top, setTop] = useState(20)
  const usage = useLoad(() => StorageApi.usage(top), [top])
  const summary = useLoad(() => MediaApi.statusSummary(), [])
  const d = usage.data
  return (
    <div>
      <PageIntro
        title="Storage space"
        lead="See how much storage space uploads use, and who uses the most."
        bullets={[
          'You can see the total space used by all uploads.',
          'You can see which users use the most space.',
          'You can open a user page straight from the list.',
          'You can check the upload counts by status.',
        ]}
      />
      <HowTo steps={[
        'Pick how many top users to show (1 to 100).',
        'Look at the list. The biggest space users are at the top.',
        'Click a user id to open that user page.',
        'Check "Uploads by status" at the bottom. Failed or stuck uploads need a look on the Uploads page.',
      ]} />
      <Note>These numbers count only the new upload system (pipeline). Old-style uploads (avatars, chat files, post photos) are not counted yet. A copy of a file that already exists counts once, not twice.</Note>
      <div className="filters">
        <Field label="How many top users to show (1–100)"><input type="number" min={1} max={100} value={top} onChange={(e) => setTop(Number(e.target.value) || 20)} /></Field>
        <button className="secondary" onClick={() => { usage.reload(); summary.reload() }}>Refresh the list</button>
      </div>
      <Err e={usage.err} /><Loading on={usage.loading} />
      {d && (
        <>
          <Tiles items={[{ label: 'Total space used', value: fmtBytes(d.totalStoredBytes) }]} />
          <div className="card">
            <h2>Who uses the most space</h2>
            <DataTable
              columns={[
                { key: 'ownerId', label: 'User', render: (r) => <Link to={`/users/${r.ownerId}`}><Id v={r.ownerId} /></Link> },
                { key: 'storedBytes', label: 'Space used', render: (r) => fmtBytes(r.storedBytes) },
                { key: 'assets', label: 'How many files' },
              ]}
              rows={d.topOwners || []}
              loading={usage.loading}
              empty="No uploads yet, so no space is used."
            />
          </div>
        </>
      )}
      <div className="card">
        <h2>Uploads by status</h2>
        <Err e={summary.err} />
        {summary.data && (
          <Tiles items={Object.entries(summary.data).map(([k, v]) => ({ label: STATUS_LABELS[k] || k, value: v, sub: k }))} />
        )}
        <Note>To fix failed or stuck uploads, go to the <Link to="/media">Uploads</Link> page.</Note>
      </div>
    </div>
  )
}
