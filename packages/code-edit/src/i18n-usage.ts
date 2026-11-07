import { scanMessageUsage as scan } from '@pikku/inspector-go'

export type MessageSite = { file: string; line: number; text: string }

export type MessageUsage = {
  /** Every key referenced as `m.key`, `m['key']`, `m.key(...)` or `const { key } = m`. */
  keys: Set<string>
  /** Per key, the absolute paths of the source files that reference it. */
  usedIn: Map<string, Set<string>>
  /** Places where the namespace is read in a way that names no key, so a key could be used unseen. */
  computed: MessageSite[]
  /** Files the parser reported a syntax error in, or that could not be read. */
  unparsed: string[]
  files: number
}

/**
 * Scans the whole workspace's `.ts`/`.tsx` for message keys, in the pikku-inspect binary.
 *
 * The namespace is recognised by the local names under which a file imports it:
 * - `import { m } from '<any>/i18n/messages'` or `.../paraglide/messages` (also renamed: `{ m as _m }`),
 * - `import * as X from '<any>/i18n/messages'` or `.../paraglide/messages` (Paraglide's own shape),
 * - `import { m } from '<any module>'`: `m` imported under the name `m`.
 * A file that is itself such a module (`.../i18n/messages.ts`) defines the namespace, so its own
 * whole-namespace uses (wrapping, re-typing) are not reported. Re-exports (`export { m } from`) are declarations, not uses. A local `m` (parameter, block-level
 * variable, loop or catch variable) shadows the import and is ignored.
 */
export function scanMessageUsage(root: string): MessageUsage {
  const found = scan(root)
  return {
    keys: new Set(found.keys),
    usedIn: new Map(found.usedIn.map((u) => [u.key, new Set(u.files)])),
    computed: found.computed,
    unparsed: found.unparsed,
    files: found.files,
  }
}
