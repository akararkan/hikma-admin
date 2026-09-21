/**
 * Raw API enum values with the plain words we show next to them.
 * The `value` strings are sent to the server — never change them.
 */
export const STATUS_LABELS = {
  PENDING: 'Waiting for the file',
  UPLOADING: 'Uploading',
  PROCESSING: 'Working on it',
  READY: 'Done',
  FAILED_VALIDATION: 'Failed: bad file',
  FAILED_MODERATION: 'Failed: blocked content',
  FAILED_PROCESSING: 'Failed: system error',
}
export const STATUS_OPTIONS = Object.entries(STATUS_LABELS)
  .map(([value, label]) => ({ value, label: `${label} (${value})` }))

export const TYPE_LABELS = {
  IMAGE: 'Photo',
  VIDEO: 'Video',
  AUDIO: 'Sound',
  FILM: 'Long video',
  VIDEO_CLIP: 'Short video',
}
export const TYPE_OPTIONS = Object.entries(TYPE_LABELS)
  .map(([value, label]) => ({ value, label: `${label} (${value})` }))

export const ROLES = ['USER', 'RESEARCHER', 'SCHOLAR', 'MODERATOR', 'SUPPORT', 'ANALYST', 'ADMIN']
