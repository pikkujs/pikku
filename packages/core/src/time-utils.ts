type TimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'year'

/** An amount of time in a unit; `value` is negative for the past. A year is 365.25 days. */
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

/** Converts a {@link RelativeTimeInput} to milliseconds, rounded to the whole second. */
export const getRelativeTimeOffset = ({
  value,
  unit,
}: RelativeTimeInput): number => {
  return Math.round(value * multipliers[unit]) * 1000
}

/** The `Date` that is `relativeTime` away from now. */
export const getRelativeTimeOffsetFromNow = (
  relativeTime: RelativeTimeInput
): Date => {
  return new Date(Date.now() + getRelativeTimeOffset(relativeTime))
}

/**
 * Normalises a duration to milliseconds: a number is taken as milliseconds already,
 * a string is parsed by {@link parseDurationString}.
 *
 * @throws Error when the string is not a recognised duration.
 */
export const getDurationInMilliseconds = (
  duration: string | number
): number => {
  if (typeof duration === 'number') {
    return duration
  }
  return parseDurationString(duration)
}

/**
 * Parses a duration such as `'500ms'`, `'5s'`, `'10min'`, `'1hour'`, `'2days'`,
 * `'1week'` or `'1y'` into milliseconds. Whole numbers only, no spaces.
 *
 * @throws Error when the string does not match the format.
 */
export const parseDurationString = (duration: string): number => {
  const match = duration.match(
    /^(\d+)(ms|milliseconds?|s|sec|seconds?|m|min|minutes?|h|hour|hours?|d|day|days?|w|week|weeks?|y|year|years?)$/
  )

  if (!match) {
    throw new Error(
      `Invalid duration format: ${duration}. Use formats like '2s', '5s', '5min', '1hour', '2days', '1week'`
    )
  }

  const value = parseInt(match[1], 10)
  const unitStr = match[2]

  if (
    unitStr === 'ms' ||
    unitStr === 'millisecond' ||
    unitStr === 'milliseconds'
  ) {
    return value
  }

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
