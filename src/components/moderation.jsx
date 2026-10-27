/**
 * Shared primitives for the automated text-moderation surface
 * (review queue, policy settings, dataset & model registry).
 *
 * The one idea this module exists for: **a raw score is meaningless without its band.**
 * 0.42 `insult` inside a 0.30/0.80 band is a genuine coin-flip; the same 0.42 `threat`
 * inside 0.15/0.50 is nearly a block. Everything here renders scores against the bands
 * the server said were in force for that entity type — never the bare number.
 */
import React from 'react'
import { Badge, Note } from './ui'

/* ---------------- vocabulary (mirrors the enums in ak.dev.irc.app.moderation.enums) ---------------- */

/** The six model heads, in the order the API returns them. */
export const LABELS = ['toxic', 'severe_toxic', 'obscene', 'threat', 'insult', 'identity_hate']

/**
 * `threat` and `identity_hate` ship with lower bands (0.15/0.50 and 0.15/0.55) because a false
 * negative on either costs far more than a false positive. The settings editor warns on loosening.
 */
export const STRICT_LABELS = new Set(['threat', 'identity_hate'])

export const ENTITY_TYPES = [
  'post', 'post_comment', 'story', 'story_poll', 'research', 'research_comment',
  'qna_question', 'qna_answer', 'chat_message', 'channel', 'content_annotation',
]

/**
 * The queue also carries `media_image` cases (the NSFW image gate), but the per-label text bands
 * do not apply to them — so the settings editors keep using ENTITY_TYPES, and only the queue
 * filter offers the image type.
 */
export const QUEUE_ENTITY_TYPES = [...ENTITY_TYPES, 'media_image']
export const isImageCase = (entityType) => String(entityType || '').toUpperCase() === 'MEDIA_IMAGE'

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'IN_REVIEW']
export const REASON_CODES = ['MODEL', 'BLOCKLIST', 'SLA_BREACH', 'ADMIN', 'INFERENCE_UNAVAILABLE', 'MODEL_UNAVAILABLE', 'DISABLED', 'NO_TEXT', 'SUPERSEDED']
export const FALLBACKS = ['FAIL_CLOSED', 'FAIL_OPEN_SHADOW']
export const MODEL_STATUSES = ['TRAINING', 'EVALUATING', 'READY', 'SHADOW', 'ACTIVE', 'RETIRED', 'FAILED']
export const TRAINING_SOURCES = [
  'ADMIN_MANUAL', 'ADMIN_CORRECTION', 'REVIEW_PROMOTION', 'SEED_DATASET', 'USER_REPORT_CONFIRMED',
  'ADMIN_IMPORT',
]

/**
 * Chat bodies are withheld from staff by policy — the queue returns scores, field
 * names and bands but never the message, and `teachModel` is ignored for them (promoting a private
 * message into the training set would bake it into model weights, a far larger disclosure).
 */
const REDACTED_TYPES = new Set(['CHAT_MESSAGE'])
export const isRedacted = (entityType) => REDACTED_TYPES.has(String(entityType || '').toUpperCase())

/* ---------------- band arithmetic ---------------- */

export function fmtScore(n) {
  if (n === null || n === undefined || n === '') return '—'
  const v = Number(n)
  return Number.isFinite(v) ? v.toFixed(3) : String(n)
}

/**
 * The decision engine's three bands. Both edges compare with `>=`: a score exactly equal to `high`
 * auto-blocks, one exactly equal to `low` goes to review — the stricter reading of each boundary.
 */
export function bandVerdict(score, band) {
  const s = Number(score)
  if (!band || !Number.isFinite(s)) return null
  const { low, high } = band
  if (Number.isFinite(high) && s >= high) return 'REJECT'
  if (Number.isFinite(low) && s >= low) return 'REVIEW'
  return 'APPROVE'
}

/** Worst-of aggregation across fields (§5.4): any REJECT wins, else any REVIEW, else APPROVE. */
export function worstOf(verdicts) {
  const v = verdicts.filter(Boolean).map((x) => String(x).toUpperCase())
  if (v.includes('REJECT')) return 'REJECT'
  if (v.includes('REVIEW')) return 'REVIEW'
  return v.length ? 'APPROVE' : null
}

const VERDICT_KIND = { APPROVE: 'green', REVIEW: 'blue', REJECT: 'err' }

export function VerdictBadge({ value }) {
  if (!value) return null
  const v = String(value).toUpperCase()
  return <Badge kind={VERDICT_KIND[v] || 'gray'}>{v}</Badge>
}

/** Why the case landed here. SLA_BREACH / INFERENCE_UNAVAILABLE / MODEL_UNAVAILABLE mean the model never answered. */
export function ReasonBadge({ value }) {
  if (!value) return null
  const v = String(value).toUpperCase()
  const kind = v === 'BLOCKLIST' ? 'red'
    : (v === 'SLA_BREACH' || v === 'INFERENCE_UNAVAILABLE' || v === 'MODEL_UNAVAILABLE') ? 'err'
      : v === 'MODEL' ? 'blue' : 'gray'
  return <Badge kind={kind}>{v}</Badge>
}

/* ---------------- the score-against-band meter ---------------- */

const pct = (x) => `${Math.max(0, Math.min(1, Number(x) || 0)) * 100}%`

/**
 * One label's score drawn on a 0→1 track shaded into its three bands, with a needle at the score.
 * Without a band the track stays neutral and no verdict is claimed — a number with no policy behind
 * it is exactly the thing this component refuses to imply meaning for.
 */
export function ScoreMeter({ label, score, band, showBand = true }) {
  const s = Number(score)
  const hasScore = Number.isFinite(s)
  const low = Number(band?.low), high = Number(band?.high)
  const hasBand = Number.isFinite(low) && Number.isFinite(high)
  const verdict = hasBand && hasScore ? bandVerdict(s, band) : null
  const strict = STRICT_LABELS.has(String(label))

  return (
    <div className="smeter">
      <span className={`smeter-label${strict ? ' strict' : ''}`} title={strict ? 'We are extra careful with this one — missing a real case here hurts much more than a false alarm' : undefined}>
        {label}
      </span>
      <div className={`smeter-track${hasBand ? '' : ' plain'}`}>
        {hasBand && <>
          <div className="smeter-zone approve" style={{ left: 0, width: pct(low) }} />
          <div className="smeter-zone review" style={{ left: pct(low), width: pct(high - low) }} />
          <div className="smeter-zone reject" style={{ left: pct(high), width: pct(1 - high) }} />
          <div className="smeter-edge" style={{ left: pct(low) }} title={`low limit ${fmtScore(low)} — at or above this, a person must check it`} />
          <div className="smeter-edge" style={{ left: pct(high) }} title={`high limit ${fmtScore(high)} — at or above this, it is blocked by itself`} />
        </>}
        {hasScore && <div className={`smeter-needle ${String(verdict || '').toLowerCase()}`} style={{ left: pct(s) }} title={`score ${fmtScore(s)}`} />}
      </div>
      <span className="smeter-score mono">{fmtScore(score)}</span>
      {showBand && (
        <span className="smeter-band mono muted">{hasBand ? `${fmtScore(low)} / ${fmtScore(high)}` : 'no band'}</span>
      )}
      <span className="smeter-verdict"><VerdictBadge value={verdict} /></span>
    </div>
  )
}

/**
 * All six labels for one field, band-aware, sorted so whatever is driving the verdict reads first.
 * "Top label" is the label that most drives the verdict, not simply the highest number — a threat at
 * 0.55 crossing its 0.50 bar matters more than an insult at 0.70 that does not cross its 0.80 bar.
 */
export function ScoreGrid({ scores, bands, sort = true }) {
  if (!scores || typeof scores !== 'object') return <span className="muted">no scores yet</span>
  const keys = LABELS.filter((l) => l in scores).concat(Object.keys(scores).filter((k) => !LABELS.includes(k)))
  const rank = { REJECT: 2, REVIEW: 1, APPROVE: 0 }
  const rows = keys.map((l) => ({ label: l, score: scores[l], band: bands?.[l] }))
  if (sort) {
    rows.sort((a, b) => {
      const ra = rank[bandVerdict(a.score, a.band)] ?? -1
      const rb = rank[bandVerdict(b.score, b.band)] ?? -1
      if (ra !== rb) return rb - ra
      return (Number(b.score) || 0) - (Number(a.score) || 0)
    })
  }
  return <div className="smeters">{rows.map((r) => <ScoreMeter key={r.label} {...r} />)}</div>
}

/** Legend for the shaded zones — worth one line above a grid of meters. */
export function BandLegend() {
  return (
    <div className="band-legend">
      <span><i className="sw approve" /> green = the AI says OK by itself</span>
      <span><i className="sw review" /> middle = a person must look at it</span>
      <span><i className="sw reject" /> red = the AI blocks it by itself</span>
    </div>
  )
}

/* ---------------- training labels ---------------- */

/** `{toxic: 1, insult: 1, …}` → chips for the positives only. */
export function LabelPills({ labels }) {
  if (!labels) return <span className="muted">—</span>
  const on = LABELS.filter((l) => Number(labels[l]) === 1)
  if (on.length === 0) return <span className="muted">clean — nothing bad marked</span>
  // The ' *' echoes the smeter-label strict marker: cardinal vs digital red alone is
  // CVD-confusable, so strictness also gets a shape cue.
  return <span className="row tight">{on.map((l) => <Badge key={l} kind={STRICT_LABELS.has(l) ? 'err' : 'red'}>{l}{STRICT_LABELS.has(l) ? ' *' : ''}</Badge>)}</span>
}

/** The six-label picker used by every "teach it" form. Value is `{label: 0|1}`. */
export function LabelCheckboxes({ value, onChange }) {
  const v = value || {}
  const toggle = (l) => onChange({ ...v, [l]: Number(v[l]) === 1 ? 0 : 1 })
  return (
    <div className="label-picker">
      {LABELS.map((l) => (
        <label key={l} className={`label-chip${Number(v[l]) === 1 ? ' on' : ''}`}>
          <input type="checkbox" checked={Number(v[l]) === 1} onChange={() => toggle(l)} />
          <span>{l}</span>
        </label>
      ))}
    </div>
  )
}

/** Absent labels default to 0 server-side; send only what was ticked. */
export const labelsToBody = (v) => Object.fromEntries(LABELS.filter((l) => Number(v?.[l]) === 1).map((l) => [l, 1]))
export const anyLabelSet = (v) => LABELS.some((l) => Number(v?.[l]) === 1)

/* ---------------- misc ---------------- */

/**
 * Image cases invert the queue's normal stakes: the image is ALREADY live (the gate publishes the
 * uncertain middle), approve is a no-op that closes the case, and reject deletes the stored file —
 * original and every size — with no undo. Teach and rescore are text-model tools and do nothing here.
 */
export function ImageCaseNote({ entityType }) {
  if (!isImageCase(entityType)) return null
  return (
    <Note>
      This case is an <strong>image</strong>, and the rules are different from text.
      The image is <strong>already live</strong> — it was published when it was uploaded.
      Approve only closes the case; nothing changes for users.
      Reject <strong>deletes the image file forever</strong> (every size of it) and tells the author.
      There is no undo. &ldquo;Teach the AI&rdquo; and &ldquo;Score again&rdquo; do not work on images —
      only a person decides an image case.
    </Note>
  )
}

export function RedactionNote({ entityType }) {
  if (!isRedacted(entityType)) return null
  return (
    <Note>
      This is a private message. We never show private messages to staff — that is a firm rule.
      You can see the AI&rsquo;s scores, but not the words. Also, &ldquo;teach the AI&rdquo; is
      turned off here, because teaching would copy the private text into the AI&rsquo;s memory.
    </Note>
  )
}

/** Hold deadlines are the SLA clock; a passed deadline with no verdict is the breach. */
export function Countdown({ to, breached }) {
  if (!to) return <span className="muted">—</span>
  const ms = new Date(to).getTime() - Date.now()
  if (!Number.isFinite(ms)) return <span className="muted">{String(to)}</span>
  if (breached || ms <= 0) return <Badge kind="err">Past the time limit</Badge>
  const s = Math.round(ms / 1000)
  return <span className="mono">{s < 90 ? `${s}s` : `${Math.round(s / 60)}m`} left</span>
}
