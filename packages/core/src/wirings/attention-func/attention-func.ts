import type {
  AttentionFuncBody,
  PikkuAttentionFunc,
} from './attention-func.types.js'

const WIDGET_ID = /^[a-z][A-Za-z0-9-]*\.[a-z][A-Za-z0-9-]*$/
const EVERY = /^(\d+)(m|h|d)$/

/**
 * The cron expression a duration refreshes on. A minute is the finest grain a
 * cron has, so seconds are refused rather than rounded.
 *
 * @throws Error when `every` is not whole minutes, hours or days.
 */
export const attentionSchedule = (widget: string, every: string): string => {
  const match = EVERY.exec(every)
  const amount = match ? Number(match[1]) : 0
  if (!match || amount < 1) {
    throw new Error(
      `Attention func '${widget}' has every: '${every}' — use whole minutes, hours or days, such as '1m', '2h' or '1d'`
    )
  }
  const [, , unit] = match
  if (unit === 'm' && amount <= 59) return `*/${amount} * * * *`
  if (unit === 'h' && amount <= 23) return `0 */${amount} * * *`
  if (unit === 'd' && amount <= 30) return `0 0 */${amount} * *`
  throw new Error(
    `Attention func '${widget}' has every: '${every}' — that is longer than one step of its unit; use the next unit up`
  )
}

/**
 * Declares what a widget needs attention for. The func reads the facts through
 * the project's usual functions and returns nothing when all is fine, or an
 * {@link AttentionScore} when it is not. Pikku runs it as a workflow, on a
 * schedule and on demand, and stores each run per project and widget.
 *
 * Declare it in a `*.attention.ts` file. Its `widget` must be `<screen>.<slot>`
 * of one of the plugin's own arranged screens: `pikku all` refuses any other.
 *
 * @example snippet: attentionFunc
 */
export const pikkuAttentionFunc = <Services = any>(config: {
  /** A `<screen>.<slot>` id of one of the plugin's own arranged screens. */
  widget: string
  /** How often the stored result is refreshed: `1m`, `15m`, `2h`, `1d`. */
  every: string
  /** A normal Pikku function body. `data` is `{ projectKey }`. */
  func: AttentionFuncBody<Services>
}): PikkuAttentionFunc<Services> => {
  if (!WIDGET_ID.test(config.widget)) {
    throw new Error(
      `Attention func widget '${config.widget}' is not a '<screen>.<slot>' id`
    )
  }
  attentionSchedule(config.widget, config.every)
  return { widget: config.widget, every: config.every, func: config.func }
}
