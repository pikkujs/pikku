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

/**
 * Parse a duration string to milliseconds
 * Supports formats like: '5s', '5sec', '5seconds', '5m', '5min', '5minutes', '1h', '1hour', '2d', '2day', '1w', '1week'
 *
 * @param duration - Duration string (e.g., '5min', '2hours', '1day')
 * @returns Duration in milliseconds
 */
export const parseDurationString = (duration: string): number => {
  const match = duration.match(
    /^(\d+)(s|sec|seconds?|m|min|minutes?|h|hour|hours?|d|day|days?|w|week|weeks?|y|year|years?)$/
  )

  if (!match) {
    throw new Error(
      `Invalid duration format: ${duration}. Use formats like '5s', '5min', '1hour', '2days', '1week'`
    )
  }

  const value = parseInt(match[1], 10)
  const unitStr = match[2]

  // Map string variations to TimeUnit
  let unit: TimeUnit
  if (
    unitStr === 's' ||
    unitStr === 'sec' ||
    unitStr === 'second' ||
    unitStr === 'seconds'
  ) {
    unit = 'second'
  } else if (
    unitStr === 'm' ||
    unitStr === 'min' ||
    unitStr === 'minute' ||
    unitStr === 'minutes'
  ) {
    unit = 'minute'
  } else if (unitStr === 'h' || unitStr === 'hour' || unitStr === 'hours') {
    unit = 'hour'
  } else if (unitStr === 'd' || unitStr === 'day' || unitStr === 'days') {
    unit = 'day'
  } else if (unitStr === 'w' || unitStr === 'week' || unitStr === 'weeks') {
    unit = 'week'
  } else if (unitStr === 'y' || unitStr === 'year' || unitStr === 'years') {
    unit = 'year'
  } else {
    throw new Error(`Unknown time unit: ${unitStr}`)
  }

  return getRelativeTimeOffset({ value, unit })
}
