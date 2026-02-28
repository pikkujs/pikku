import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

type DayjsUnit =
  | 'year'
  | 'month'
  | 'week'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second'
  | 'millisecond'

const unitMap: Record<string, DayjsUnit> = {
  years: 'year',
  months: 'month',
  weeks: 'week',
  days: 'day',
  hours: 'hour',
  minutes: 'minute',
  seconds: 'second',
  milliseconds: 'millisecond',
}

export const DateTimeInput = z.object({
  value: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      'The input date/time value (ISO string, timestamp, or parseable date string)'
    ),
  operation: z
    .enum([
      'format',
      'parse',
      'add',
      'subtract',
      'startOf',
      'endOf',
      'diff',
      'now',
    ])
    .describe('The operation to perform'),
  format: z
    .string()
    .optional()
    .describe('Output format for format operation (e.g., YYYY-MM-DD)'),
  amount: z.number().optional().describe('Amount for add/subtract operations'),
  unit: z
    .enum([
      'years',
      'months',
      'weeks',
      'days',
      'hours',
      'minutes',
      'seconds',
      'milliseconds',
    ])
    .optional()
    .describe('Time unit for add/subtract/startOf/endOf/diff operations'),
  compareWith: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Second date for diff operation'),
  timezone: z
    .string()
    .optional()
    .describe('Timezone for conversion (e.g., America/New_York)'),
})

export const DateTimeOutput = z.object({
  result: z
    .union([z.string(), z.number()])
    .describe('The result of the operation'),
  iso: z.string().describe('ISO 8601 formatted date string'),
  timestamp: z.number().describe('Unix timestamp in milliseconds'),
})

type Output = z.infer<typeof DateTimeOutput>

export const dateTime = pikkuSessionlessFunc({
  description: 'Manipulate date and time values',
  node: { displayName: 'Date & Time', category: 'Data', type: 'action' },
  input: DateTimeInput,
  output: DateTimeOutput,
  func: async (_services, data) => {
    let date =
      data.operation === 'now' || !data.value ? dayjs() : dayjs(data.value)

    if (data.timezone) {
      date = date.tz(data.timezone)
    }

    let result: string | number

    switch (data.operation) {
      case 'format':
        result = date.format(data.format ?? 'YYYY-MM-DDTHH:mm:ssZ')
        break
      case 'parse':
        result = date.valueOf()
        break
      case 'add':
        date = date.add(data.amount ?? 0, unitMap[data.unit ?? 'days'])
        result = date.toISOString()
        break
      case 'subtract':
        date = date.subtract(data.amount ?? 0, unitMap[data.unit ?? 'days'])
        result = date.toISOString()
        break
      case 'startOf':
        date = date.startOf(unitMap[data.unit ?? 'days'])
        result = date.toISOString()
        break
      case 'endOf':
        date = date.endOf(unitMap[data.unit ?? 'days'])
        result = date.toISOString()
        break
      case 'diff':
        const compareDate = data.compareWith ? dayjs(data.compareWith) : dayjs()
        result = date.diff(
          compareDate,
          unitMap[data.unit ?? 'milliseconds'],
          true
        )
        break
      case 'now':
      default:
        result = date.toISOString()
    }

    return {
      result,
      iso: date.toISOString(),
      timestamp: date.valueOf(),
    }
  },
})
