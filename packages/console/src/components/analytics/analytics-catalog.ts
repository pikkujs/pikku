import type { AnalyticsEventMeta } from '@pikku/core/analytics'

/**
 * The declaration site, not the machine it was generated on.
 *
 * Meta records an absolute path, which is the build machine's truth and nobody
 * else's. Every event in one project shares a prefix, so subtracting the
 * longest one they all agree on leaves the part an engineer can act on.
 */
export const commonDirPrefix = (paths: readonly string[]): string => {
  if (paths.length === 0) return ''
  const split = paths.map((path) => path.split('/').slice(0, -1))
  const [first, ...rest] = split as [string[], ...string[][]]
  let shared = first.length
  for (const parts of rest) {
    let i = 0
    while (i < shared && i < parts.length && parts[i] === first[i]) i++
    shared = i
  }
  return shared === 0 ? '' : `${first.slice(0, shared).join('/')}/`
}

export const relativeTo = (prefix: string, path: string): string =>
  prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path

export type AnalyticsEventGroup = {
  /** The absolute path, kept as the identity — two files may share a name. */
  file: string
  /** The same path with the project prefix subtracted, for display. */
  relative: string
  events: AnalyticsEventMeta[]
}

/**
 * The catalog grouped by where it is declared.
 *
 * A file is the unit an engineer opens, so it is the unit the catalog is read
 * in: "what may this module emit" is the question, and a flat alphabetical list
 * answers a different one. Groups and the events inside them are both sorted,
 * so the page is stable across regenerations.
 */
export const groupEventsByFile = (
  events: readonly AnalyticsEventMeta[]
): AnalyticsEventGroup[] => {
  const prefix = commonDirPrefix(events.map((event) => event.file))
  const byFile = new Map<string, AnalyticsEventMeta[]>()
  for (const event of events) {
    const group = byFile.get(event.file)
    if (group) group.push(event)
    else byFile.set(event.file, [event])
  }
  return [...byFile.entries()]
    .map(([file, group]) => ({
      file,
      relative: relativeTo(prefix, file),
      events: [...group].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.relative.localeCompare(b.relative))
}

/** How many props a catalog row spells out before it counts the rest. */
export const PROP_PREVIEW_LIMIT = 5
