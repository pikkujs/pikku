/** When a run happened, at the resolution someone reading a list cares about. */
export const runRelativeTime = (iso?: string): string => {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const min = Math.round((Date.now() - then) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}

/** How long something took. Sub-second steps are the common case. */
export const runDuration = (ms?: number): string => {
  if (ms === undefined) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

/**
 * A run's version, short enough to sit at the end of a line.
 *
 * Seven characters of the commit, the way git itself abbreviates, with a `+`
 * for a tree that had uncommitted changes — the commit is then only where the
 * run started from, not what it ran. The attempt is only worth saying from the
 * second one on: `#1` on every first run would be noise on most of them.
 */
export const runVersionLabel = (version?: {
  commit: string
  dirty?: boolean
  attempt: number
}): string => {
  if (!version) return ''
  const commit = `${version.commit.slice(0, 7)}${version.dirty ? '+' : ''}`
  return version.attempt > 1 ? `${commit} #${version.attempt}` : commit
}

/**
 * Where each step starts inside its scenario's recording. Steps are recorded
 * with a duration and no timestamp, so the offset is the sum of everything
 * before it — which is also how the recording was laid down.
 */
export const stepOffsets = (steps: { durationMs?: number }[]): number[] => {
  let elapsed = 0
  return steps.map((step) => {
    const offset = elapsed
    elapsed += step.durationMs ?? 0
    return offset
  })
}

/** When a run started, as a reader would say it: a date and a time of day. */
export const runWhen = (iso: string, locale?: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

/** How long ago a run started, in the reader's language. */
export const runAgo = (iso: string, locale?: string): string => {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.round((then - Date.now()) / 60000)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return format.format(hours, 'hour')
  return format.format(Math.round(hours / 24), 'day')
}
