/**
 * Minimal view of the inspector's per-function metadata we need to copy
 * functions into an addon. Kept local so this doesn't couple to the full
 * `@pikku/inspector` state shape.
 */
export interface FunctionMetaLike {
  name?: string
  tags?: string[]
  sourceFile?: string
}

export interface BundledFunction {
  id: string
  name: string
  sourceFile: string
}

/**
 * Turn the inspector's function meta into the set of functions to bundle into
 * the addon. Selection is pikku's job, not ours: the meta handed in is whatever
 * the global `--filter`/`--tags`/`--names` flags already left in scope
 * (`getInspectorState()` returns the filtered state). We only drop entries
 * without a resolvable source file, since those can't be copied.
 */
export function selectBundledFunctions(
  meta: Record<string, FunctionMetaLike>
): { matched: BundledFunction[]; skipped: string[] } {
  const matched: BundledFunction[] = []
  const skipped: string[] = []

  for (const [id, m] of Object.entries(meta)) {
    const name = m.name ?? id
    // Internal framework functions (the auto-generated remote-RPC scaffold) are
    // tagged 'pikku'. They must never be carved: in addon (IoC) mode the addon's
    // pikku-types.gen.ts exports no wireHTTP/wireQueueWorker, so the bundled
    // scaffold would fail to compile.
    if (m.tags?.includes('pikku')) {
      continue
    }
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
 * Assign each bundled function a collision-free destination under
 * `src/functions/`. Two source files with the same basename get a numeric
 * suffix so neither is silently overwritten.
 */
export function assignBundlePaths(matched: BundledFunction[]): BundledFile[] {
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
