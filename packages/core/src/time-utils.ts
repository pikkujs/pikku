type TimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'year'

export interface RelativeTimeInput {
  value: number // negative = in the past
  unit: TimeUnit
}

const multipliers: Record<TimeUnit, number> = {
  second: 1,
  minute: 60,
  hour: 60 * 60,
  day: 60 * 60 * 24,
  week: 60 * 60 * 24 * 7,
  year: Math.round(365.25 * 60 * 60 * 24),
}

export const getRelativeTimeOffset = ({
  value,
  unit,
}: RelativeTimeInput): number => {
  return Math.round(value * multipliers[unit]) * 1000 // convert to milliseconds
}

/**
 * Returns a Unix timestamp (in seconds) offset from now by the given duration.
 * e.g. value = -1 and unit = 'day' => 1 day ago => now - 86400 seconds
 */
export const getRelativeTimeOffsetFromNow = (
  relativeTime: RelativeTimeInput
): Date => {
  return new Date(Date.now() + getRelativeTimeOffset(relativeTime))
}
