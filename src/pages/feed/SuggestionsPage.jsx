import React, { useState } from 'react'
import { SuggestionsApi } from '../../api'
import { useLoad, useAction } from '../../util'
import { DataTable, Err, Note, Loading, Field, KV, PageIntro, HowTo, Id } from '../../components/ui'

export default function SuggestionsPage() {
  const knobs = useLoad(() => SuggestionsApi.knobs(), [])
  const act = useAction()
  const [userId, setUserId] = useState('')
  const [explain, setExplain] = useState(null)
  return (
    <div>
      <PageIntro
        title="Friend suggestions (PYMK)"
        lead='See how the app picks "people you may know" for each user.'
        bullets={[
          'You can see the scoring numbers the suggestion engine uses.',
          'You can see the suggestion list saved for one user, and why each person is on it.',
          'You can see which suggestions a user said no to.',
        ]}
      />
      <HowTo steps={[
        'Type a user id in the box.',
        'Click "Show this user\'s suggestions".',
        'Read the "Why suggested" column to see the reasons.',
        'The list at the bottom shows people this user said no to. Those never come back.',
      ]} />
      <div className="card">
        <h2>Scoring numbers (read-only)</h2>
        <Note>You cannot change these numbers here. Only a developer can change them in the code. That is on purpose.</Note>
        <Err e={knobs.err} /><Loading on={knobs.loading} />
        {knobs.data && (
          <>
            {knobs.data.tuning && <Note>{knobs.data.tuning}</Note>}
            <KV obj={knobs.data} />
          </>
        )}
      </div>
      <div className="card">
        <h2>One user's suggestions</h2>
        <div className="filters">
          <Field label="User id *"><input value={userId} onChange={(e) => setUserId(e.target.value)} className="w-id" /></Field>
          <button disabled={!userId || act.busy} title="GET /api/v1/admin/suggestions/explain/{userId}" onClick={async () => {
            const r = await act.run(() => SuggestionsApi.explain(userId))
            if (r) setExplain(r)
          }}>Show this user's suggestions</button>
        </div>
        <Err e={act.err} />
        {explain && (
          <>
            <DataTable
              columns={[
                { key: 'candidateId', label: 'Suggested person', render: (r) => <Id v={r.candidateId} /> },
                { key: 'storedScore', label: 'Score' },
                { key: 'reason', label: 'Why suggested' },
                { key: 'computedAt', label: 'When it was computed' },
              ]}
              rows={explain.suggestions || []}
              empty="No saved suggestions for this user."
            />
            <h3>People this user said no to (dismissed)</h3>
            {explain.dismissedCandidateIds?.length
              ? <div className="row tight">{explain.dismissedCandidateIds.map((id) => <Id key={id} v={id} />)}</div>
              : <span className="muted">None. This user has not said no to anyone.</span>}
          </>
        )}
        <Note>To recompute suggestions or see private details, use the Privacy tools page. Only full admins can go there.</Note>
      </div>
    </div>
  )
}
