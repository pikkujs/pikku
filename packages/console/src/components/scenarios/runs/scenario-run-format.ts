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
