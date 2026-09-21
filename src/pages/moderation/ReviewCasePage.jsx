import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AutoModApi, AutoModSettingsApi, mediaUrl } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { useLoad, useAction, fmtDate, fmtNum } from '../../util'
import { Err, Ok, Note, Warn, Loading, KV, Tiles, Badge, StatusBadge, PageIntro, HowTo } from '../../components/ui'
import FormModal from '../../components/FormModal'
import {
  ReasonBadge, VerdictBadge, ScoreGrid, BandLegend, RedactionNote, ImageCaseNote, Countdown,
  isRedacted, isImageCase, worstOf, fmtScore,
} from '../../components/moderation'

const DECIDERS = ['ADMIN', 'MODERATOR']

const TEACH_HELP = 'Tick this only when the AI was clearly wrong about the words themselves. '
  + 'Your decision then becomes a training example: ADMIN_CORRECTION when you disagreed with the AI, '
  + 'REVIEW_PROMOTION when you agreed with it. A rejection is saved with the "toxic" label only — '
  + 'you can fix the labels later on the "Teach the AI" page.'

const NO_STEPUP = 'There is no extra password check on a single decision — you work this queue all day, '
  + 'and asking every time would make it unusable. Deciding many at once does ask.'

/**
 * The flagged image itself. A dead link is information, not an error: the case carries the URL,
 * not a copy, so a link that no longer loads means the asset was already deleted (by the author,
 * or with its post) — the case is closed by approving it as a no-op.
 */
function ImageFieldPreview({ url }) {
  const [dead, setDead] = useState(false)
  if (!url) return <div className="empty">No image link on this case.</div>
  const href = mediaUrl(url)
  return (
    <div>
      {dead ? (
        <Note>
          The image link is <strong>dead</strong>. That means the image was already deleted — by its
          author, or together with its post. There is nothing left to look at: click
          &ldquo;Approve — close the case&rdquo; and you are done. Approving changes nothing for users.
        </Note>
      ) : (
        <img className="case-image" src={href} alt="the flagged image" onError={() => setDead(true)} />
      )}
      <p className="footnote">
        <a href={href} target="_blank" rel="noreferrer">Open the image in a new tab ↗</a>
        {' '}· <span className="code-xs">{url}</span>
      </p>
    </div>
  )
}

export default function ReviewCasePage() {
  const { caseId } = useParams()
  const { user } = useAuth()
  const { data, err, loading, reload } = useLoad(() => AutoModApi.case(caseId), [caseId])
  const act = useAction()
  const [decide, setDecide] = useState(null)
  const [res, setRes] = useState(null) // last mutation response — carries the updated row / note / warning

  const s = data?.summary
  const fields = data?.fields || []
  const th = data?.thresholds || {}
  const redacted = isRedacted(s?.entityType)
  const img = isImageCase(s?.entityType)
  // The case detail ships the six TEXT bands even for an image case; the band that actually applies
  // is image.threshold.review/block, which only the settings surface carries — fetched on demand.
  const imgSettings = useLoad(async () => (img ? AutoModSettingsApi.settings() : null), [img])
  const imageRules = imgSettings.data?.effective?.image
  const imageBand = imageRules == null ? null
    : { nsfw: { low: Number(imageRules.reviewThreshold), high: Number(imageRules.blockThreshold) } }
  const neverScored = String(s?.reasonCode || '').toUpperCase() === 'MODEL_UNAVAILABLE'
  const entityVerdict = worstOf(fields.map((f) => f.verdict))
  const terminal = s?.status === 'APPROVED' || s?.status === 'REJECTED'
  // An absent count is not a clean record — keep the two apart or the page invents a history.
  const priors = s?.authorPriorRejections == null || !Number.isFinite(Number(s.authorPriorRejections))
    ? null
    : Number(s.authorPriorRejections)

  const canDecide = DECIDERS.includes(user?.role)
  const gate = canDecide ? undefined : `You need the ADMIN or MODERATOR role. Your role is ${user?.role || 'unknown'}.`
  const decideTitle = gate || (terminal ? 'Already decided — the server refuses a second decision.' : undefined)

  // run() returns undefined only when the call threw; an empty 2xx body comes back as null and still rescored.
  const rescore = async () => {
    const r = await act.run(() => AutoModApi.rescore(caseId), 'The AI scored it again with the live model and limits.')
    if (r === undefined) return
    setRes(r)
    if (r?.status) act.setOk(`Scored again — the case is now ${r.status}.`)
    reload()
  }

  const openDecide = (action) => { act.clear(); setRes(null); setDecide(action) }

  return (
    <div>
      <p className="backlink"><Link to="/moderation/review">← Back to "New posts to check (AI)"</Link></p>
      <PageIntro
        title="Check this post"
        lead="One held post, shown field by field with the AI scores. Nobody has seen it yet — only its author."
        bullets={[
          'You can read each text field and see its scores.',
          'You can approve the post. It then goes live.',
          'You can reject the post. It then stays hidden.',
          'You can ask the AI to score it again.',
        ]}
      />
      <HowTo steps={[
        'Read the text of each field below. Every field gets its own scores.',
        'Look at the score bars. A needle in the middle (blue) zone means the AI was not sure.',
        'Check the author\'s past rejections. History changes how you judge a post the AI was not sure about.',
        'Click "Approve — put it live" or "Reject — keep it hidden". Write a short reason.',
        'Tick "Teach the AI" only when the AI was clearly wrong about the text itself.',
      ]} />
      <p className="page-id">case id: {caseId}</p>

      <Err e={err} />
      {err?.errorCode === 'MODERATION_CASE_NOT_FOUND' && (
        <Note>Nothing found with that id. Cases use their own <code>caseId</code>, not the post's id — open the row from the queue instead.</Note>
      )}
      <Err e={act.err} /><Ok msg={act.ok} />
      {res?.note && <Note>{res.note}</Note>}
      {res?.warning && <Warn>{res.warning}</Warn>}
      <Loading on={loading} />

      {data && (
        <>
          {data.note && <Note>{data.note}</Note>}
          {data.warning && <Warn>{data.warning}</Warn>}
          <RedactionNote entityType={s?.entityType} />
          <ImageCaseNote entityType={s?.entityType} />
          {img && neverScored && (
            <Warn>
              This image was <strong>never scored</strong> — the image AI was down when it was uploaded,
              so it went live with no check at all (the fail-open rule). No model has seen it. Look at
              the image yourself with extra care.
            </Warn>
          )}
          {img && (
            <Warn>
              If you think an image shows <strong>child sexual abuse</strong>, do <em>not</em> use the
              ordinary Reject button. That case must go down the legal path (
              <Link to="/chat/legal-holds">legal holds</Link> and your escalation contact) so evidence is
              kept and reported the right way. Rejecting here would destroy the file.
            </Warn>
          )}

          <div className="card">
            <div className="card-head">
              <h2>{s?.entityLabel || s?.entityType || 'Case'} <code>{s?.entityRef}</code></h2>
              <span className="row snug">
                <StatusBadge value={s?.status} />
                <ReasonBadge value={s?.reasonCode} />
                <VerdictBadge value={entityVerdict} />
              </span>
            </div>

            {s?.blocklistHit && (
              <Warn>
                Blocked word found: <code>{s.blocklistHit}</code>. A word rule matched, so this case is here
                no matter what the AI scored. Check that the rule is the one you meant before rejecting on it alone.
              </Warn>
            )}

            <Tiles items={[
              {
                label: 'Author\'s past rejections',
                value: priors == null ? '—' : fmtNum(priors),
                sub: priors == null ? 'not reported on this case'
                  : priors === 0 ? 'no earlier rejection on record'
                    : priors === 1 ? '1 earlier rejection' : `${fmtNum(priors)} earlier rejections`,
              },
              {
                label: 'Top AI label',
                value: s?.topLabel || '—',
                // MODEL_UNAVAILABLE stores a placeholder 0.0 — printing it would read as "the AI said safe".
                sub: neverScored ? 'never scored — the AI was down' : fmtScore(s?.topScore),
              },
              { label: 'Overall verdict', value: entityVerdict ? <VerdictBadge value={entityVerdict} /> : '—', sub: `worst of ${fields.length} field${fields.length === 1 ? '' : 's'}` },
              { label: 'Wait deadline', value: <Countdown to={s?.holdDeadline} breached={s?.slaBreached} />, sub: fmtDate(s?.holdDeadline) || '—' },
            ]} />

            {priors == null
              ? <Note>The author's rejection history did not come back on this case. That is a gap in the record, not a clean record. Judge the text on its own.</Note>
              : priors >= 3
                ? <Warn>
                  {fmtNum(priors)} past rejections on this account. The same borderline score means something
                  different here than on a first-time poster.
                </Warn>
                : priors > 0
                  ? <Note>{fmtNum(priors)} past rejection{priors === 1 ? '' : 's'} on this account — some history, but not yet a pattern.</Note>
                  : <Note>No past rejections on this account. Judge the text on its own.</Note>}

            <KV obj={{
              caseId: s?.caseId,
              entityType: s?.entityType,
              entityRef: s?.entityRef,
              parentRef: s?.parentRef,
              authorId: s?.authorId,
              modelVersion: s?.modelVersion,
              submittedAt: s?.submittedAt,
              holdDeadline: s?.holdDeadline,
              decidedAt: s?.decidedAt,
              slaBreached: s?.slaBreached,
            }} />
          </div>

          {fields.length > 0 && !img && (
            <Note>
              Every field is scored on its own, and the post takes the <strong>worst</strong> verdict of its
              fields — here that is <VerdictBadge value={entityVerdict} />. This stops one bad tag from hiding
              behind a long clean article body. Repeated fields get a number (<code>tag[0]</code>, <code>tag[1]</code>).
            </Note>
          )}

          {fields.length === 0 ? (
            <div className="card">
              <h2>Scored fields</h2>
              <div className="empty">No scored fields. This is normal for a case with no text (<code>NO_TEXT</code>), or one the AI never answered.</div>
              {s?.preview && <span className="case-preview mono">{s.preview}</span>}
            </div>
          ) : (
            <>
              {img ? (
                <Note>
                  The bar below shows where the image&rsquo;s <code>nsfw</code> score sits between the two
                  image limits: below the middle zone the image would have published quietly, the middle
                  zone means it published <em>and</em> a person must look (this case), and the red zone
                  would have blocked the upload on the spot.
                </Note>
              ) : <BandLegend />}
              {fields.map((f, i) => (
                <div className="card" key={f.fieldName || i}>
                  <div className="card-head">
                    <h2><code>{f.fieldName}</code></h2>
                    <span className="row snug">
                      {f.blocklistHit && <Badge kind="red">blocked word: {f.blocklistHit}</Badge>}
                      {f.topLabel && <span className="mono muted">top {f.topLabel} {neverScored ? '(never scored)' : fmtScore(f.topScore)}</span>}
                      <VerdictBadge value={f.verdict} />
                    </span>
                  </div>
                  {img
                    ? <ImageFieldPreview url={f.text} />
                    : <div className={`field-text${redacted ? ' redacted' : ''}`}>{f.text ?? '—'}</div>}
                  <div className="mt-2"><ScoreGrid scores={f.scores} bands={img ? (imageBand || undefined) : th.bands} /></div>
                </div>
              ))}
            </>
          )}

          {img ? (
            <div className="card">
              <h2>The image rules in force</h2>
              <Err e={imgSettings.err} /><Loading on={imgSettings.loading} />
              {imageRules ? (
                <>
                  <KV obj={{
                    enabled: imageRules.enabled,
                    blockThreshold: imageRules.blockThreshold,
                    reviewThreshold: imageRules.reviewThreshold,
                    fallback: imageRules.fallback,
                    videoPosters: imageRules.videoPosters,
                  }} />
                  <Note>
                    At or above <code>blockThreshold</code> an upload is refused on the spot — nothing is
                    stored. From <code>reviewThreshold</code> up to that, the image publishes and a case
                    lands here. The AI version that scored this case is <code>{s?.modelVersion || '—'}</code> —
                    put it in any report you write about a miss.
                  </Note>
                </>
              ) : !imgSettings.loading && !imgSettings.err && (
                <div className="empty">The image rules did not come back from the server.</div>
              )}
              <p className="footnote">You change these limits in the "Image checks" part of the "AI rules" page, not here.</p>
            </div>
          ) : (
          <div className="card">
            <h2>The rules used for this post</h2>
            <KV obj={{ entityType: th.entityType, holdMs: th.holdMs, fallback: th.fallback }} />
            <Note>
              <code>holdMs</code> is the longest possible wait, not a delay. Clean content clears in under a
              second. Only content still unscored when the clock runs out falls to the fallback rule below.
            </Note>
            {th.fallback === 'FAIL_CLOSED' && (
              <Note>
                <code>FAIL_CLOSED</code> — unscored content stays hidden, goes to the top of the queue, and is
                flagged as past its time limit. The safe default: nothing goes live until the AI or a person looked at it.
              </Note>
            )}
            {th.fallback === 'FAIL_OPEN_SHADOW' && (
              <Warn>
                <code>FAIL_OPEN_SHADOW</code> — unscored content goes live right away and is only flagged for
                review after. Okay for short-lived, low-risk things like stories; risky for anything lasting.
              </Warn>
            )}
            <p className="footnote">The shaded zones on each score bar are the limits in force. You change them on the "AI rules" page, not here.</p>
          </div>
          )}

          <div className="card sticky-cta">
            <h2>Decide</h2>
            <Note>{NO_STEPUP} {img
              ? 'For an image the lasting side effect is Reject: it deletes the image file forever.'
              : 'The one lasting side effect to think about is "Teach the AI" — explained in the form.'}</Note>
            {terminal && (
              <Warn>
                Already {s?.status}{s?.decidedAt ? ` at ${fmtDate(s.decidedAt)}` : ''}. You cannot decide it a
                second time.{img ? '' : ' "Score again" still works and only rewrites the stored scores.'}
              </Warn>
            )}
            <div className="row">
              <button disabled={!canDecide || terminal || act.busy} title={decideTitle} onClick={() => openDecide('APPROVE')}>
                {img ? 'Approve — close the case…' : 'Approve — put it live…'}
              </button>
              <button className="danger" disabled={!canDecide || terminal || act.busy} title={decideTitle} onClick={() => openDecide('REJECT')}>
                {img ? 'Reject — delete the image forever…' : 'Reject — keep it hidden…'}
              </button>
              <button className="secondary" disabled={!canDecide || act.busy || img}
                title={gate || (img ? 'Not for images — the text AI cannot score a picture, so only a person decides an image case.' : undefined)}
                onClick={rescore}>Score again</button>
            </div>
            <p className="footnote">{img
              ? '"Score again" is off for images. The scoring AI here reads text only — it would read the image link as harmless words and quietly approve a flagged image.'
              : '"Score again" runs the AI once more with today\'s model and limits — useful after a new AI version starts. It does not decide anything.'}</p>
          </div>
        </>
      )}

      {decide && (
        <FormModal
          title={decide === 'APPROVE'
            ? (img ? 'Approve — close the case' : 'Approve — put the post live')
            : (img ? 'Reject — delete the image forever' : 'Reject — keep the post hidden')}
          danger={decide === 'REJECT'}
          intro={img
            ? (decide === 'APPROVE'
              ? 'The image is already live, so approving changes nothing for users — it only closes the case. If the image link was dead, this is the right button: the image was already deleted. '
              : 'This deletes the image file forever — the original and every size of it. The author gets a message that their image was removed. The post keeps its text and other pictures; only this image goes away. There is no undo. ')
              + NO_STEPUP
            : (decide === 'APPROVE'
              ? 'This publishes the held post. Everyone can then see it. '
              : 'This keeps the post hidden. Only the author will know. ')
              + NO_STEPUP
              + (redacted ? ' "Teach the AI" is not shown here — this is a private message, and the server never trains on those.' : '')}
          fields={[
            { name: 'reason', label: 'Why? (max 500 letters)', type: 'textarea', placeholder: 'What decided it — saved on the case and in the action history.' },
            // Teach only exists for text — the server silently skips it on images and private chat.
            ...(redacted || img ? [] : [{ name: 'teachModel', label: 'Teach the AI from this decision', type: 'checkbox', help: TEACH_HELP }]),
          ]}
          submitLabel={decide === 'APPROVE'
            ? (img ? 'Approve — close the case' : 'Approve — put it live')
            : (img ? 'Reject — delete the image forever' : 'Reject — keep it hidden')}
          onSubmit={async (v) => {
            if (v.reason && String(v.reason).length > 500) throw new Error(`Your reason is ${String(v.reason).length} letters long. The limit is 500.`)
            const r = await AutoModApi.decide(caseId, { action: decide, reason: v.reason, teachModel: (redacted || img) ? false : !!v.teachModel })
            setRes(r)
            act.clear()
            act.setOk(decide === 'APPROVE'
              ? (img ? 'Approved. The case is closed — the image was live already.' : 'Approved. The post is now live.')
              : (img ? 'Rejected. The image is being deleted and the author gets a message.' : 'Rejected. The post stays hidden.'))
            reload()
          }}
          onClose={() => setDecide(null)}
        />
      )}
    </div>
  )
}
