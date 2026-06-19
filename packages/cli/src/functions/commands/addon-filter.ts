/**
 * Minimal view of the inspector's per-function metadata we need to select and
 * copy functions into an addon. Kept local so this doesn't couple to the full
 * `@pikku/inspector` state shape.
 */
export interface FunctionMetaLike {
  name?: string
  tags?: string[]
  sourceFile?: string
}

export interface FilteredFunction {
  id: string
  name: string
  sourceFile: string
}

/**
 * Resolve a `--filter` expression against the inspector's function metadata.
 *
 * The expression is a comma-separated list of tokens; a function matches if, for
 * any token, the token is one of its tags or a case-insensitive substring of its
 * name/id. Functions without a resolvable `sourceFile` cannot be bundled and are
 * skipped (reported via `skipped`).
 */
export function resolveFilteredFunctions(
  meta: Record<string, FunctionMetaLike>,
  filter: string
): { matched: FilteredFunction[]; skipped: string[] } {
  const tokens = filter
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)

  if (tokens.length === 0) {
    throw new Error('Addon filter is empty — pass at least one token')
  }

  const matched: FilteredFunction[] = []
  const skipped: string[] = []

  for (const [id, m] of Object.entries(meta)) {
    const name = m.name ?? id
    const tags = (m.tags ?? []).map((t) => t.toLowerCase())
    const haystack = `${id} ${name}`.toLowerCase()
    const hit = tokens.some(
      (token) => tags.includes(token) || haystack.includes(token)
    )
    if (!hit) continue
    if (!m.sourceFile) {
      skipped.push(name)
      continue
    }
    matched.push({ id, name, sourceFile: m.sourceFile })
  }

  matched.sort((a, b) => a.id.localeCompare(b.id))
  return { matched, skipped }
}

export interface BundledFile {
  /** Destination path inside the addon, relative to its root. */
  destPath: string
  /** Absolute source file to copy from. */
  sourceFile: string
}

/**
 * Assign each matched function a collision-free destination under
 * `src/functions/`. Two source files with the same basename get a numeric
 * suffix so neither is silently overwritten.
 */
export function assignBundlePaths(matched: FilteredFunction[]): BundledFile[] {
  const used = new Set<string>()
  const bundled: BundledFile[] = []
  for (const fn of matched) {
    const base = fn.sourceFile.split('/').pop() ?? `${fn.id}.ts`
    let dest = `src/functions/${base}`
    if (used.has(dest)) {
      // Split on the first dot so a compound extension like `.function.ts`
      // stays intact: `charge.function.ts` -> `charge-2.function.ts`.
      const dot = base.indexOf('.')
      const stem = dot > 0 ? base.slice(0, dot) : base
      const ext = dot > 0 ? base.slice(dot) : ''
      let n = 2
      while (used.has(`src/functions/${stem}-${n}${ext}`)) n++
      dest = `src/functions/${stem}-${n}${ext}`
    }
    used.add(dest)
    bundled.push({ destPath: dest, sourceFile: fn.sourceFile })
  }
  return bundled
}
