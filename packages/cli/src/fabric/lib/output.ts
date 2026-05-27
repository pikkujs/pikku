import chalk from 'chalk'

/**
 * Render helpers shared by the fabric read commands.
 *
 * These run inside a command's `render` (post-return, human output only).
 * `--json` is handled globally by the CLI runner, which routes the command's
 * result through the JSON renderer instead — so these helpers never deal with
 * the json case. They just turn returned data into a pretty, coloured table.
 */
type Cell = string | number | null | undefined

const cell = (c: Cell): string => (c === null || c === undefined ? '' : String(c))

/** Dim, secondary text (hints, empty-state lines, labels). */
export const dim = (s: string): string => chalk.dim(s)

/** Status / change colours — mirror the console UI: green = good/added,
 * amber = in-flight/changed, red = failed/removed. */
export const added = (s: string): string => chalk.green(s)
export const changed = (s: string): string => chalk.hex('#d97706')(s)
export const removed = (s: string): string => chalk.red(s)

const GOOD = /^(active|healthy|succeeded|success|ready|running|live|ok|added)$/i
const BUSY =
  /^(deploying|planned|suspended|pending|building|provisioning|queued|in_progress|changed)$/i
const BAD = /^(failed|error|crashed|unhealthy|dead|removed|cancelled|canceled)$/i

/** Colour a status token by its meaning (falls back to dim). */
export function statusColor(status: string): string {
  if (GOOD.test(status)) return added(status)
  if (BUSY.test(status)) return changed(status)
  if (BAD.test(status)) return removed(status)
  return dim(status)
}

// Strip ANSI so coloured cells still measure/align correctly.
const visibleLen = (s: string): number => s.replace(/\x1b\[[0-9;]*m/g, '').length

/** Space-padded aligned columns with a dim header — the default human table. */
export function table(headers: string[], rows: Cell[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => visibleLen(cell(r[i]))))
  )
  const pad = (c: Cell, i: number) => {
    const s = cell(c)
    return s + ' '.repeat(Math.max(0, widths[i] - visibleLen(s)))
  }
  const fmt = (r: Cell[]) => r.map(pad).join('  ')
  return [chalk.dim(fmt(headers)), ...rows.map(fmt)].join('\n')
}

/** Aligned `key  value` lines with dim keys. */
export function keyValue(rows: [string, string][]): string {
  const width = Math.max(...rows.map(([k]) => k.length))
  return rows.map(([k, v]) => `${chalk.dim(k.padEnd(width))}  ${v}`).join('\n')
}
