#!/usr/bin/env node
// Fails if a frontend reaches a Paraglide message through a computed key.
//
// Why: Paraglide's whole value is that `m.some_key()` is a compiled function —
// rename or delete the message and the build breaks. A resolver that takes a
// key string (`mKey('apis.search.http')`, `m[expr]()`) trades that for a
// runtime `console.warn`, so a stale key ships as either blank UI or the raw
// key rendered at the user. It also defeats per-message tree-shaking, since
// every message must stay reachable.
//
// `packages/console` carried `mKey`/`mList` through its i18next migration and
// they have been removed; this keeps them from growing back. Where a key is
// genuinely dynamic, map the discriminant to a message *function* — the map is
// type-checked, a string is not.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.deploy',
  '.pikku',
  'paraglide',
  '.git',
])

// Only frontend source is in scope — `packages/skills` documents these names in
// order to forbid them, and this file names them too.
const ROOTS = ['packages/console/src', 'packages/react/src', 'templates']

const PATTERNS = [
  {
    // `mKey(...)` / `mList(...)` / `mExists(...)` — the named resolvers.
    re: /\bm(?:Key|List|Exists)\s*\(/,
    hint: 'call the message directly (`m.some_key()`), or map the discriminant to a message function',
  },
  {
    // `m['literal_or_expr']()` / `m[expr]()` — the same thing spelled inline.
    re: /\bm\s*\[[^\]]+\]\s*\(/,
    hint: 'index a typed map of message functions instead of indexing `m` itself',
  },
]

function sourceFiles(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full)
  }
  return out
}

const failures = []
for (const root of ROOTS) {
  for (const file of sourceFiles(join(ROOT, root))) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (line.trimStart().startsWith('//')) return
      for (const { re, hint } of PATTERNS) {
        if (re.test(line)) {
          failures.push(
            `${relative(ROOT, file)}:${i + 1}\n    ${line.trim()}\n    → ${hint}`
          )
        }
      }
    })
  }
}

if (failures.length > 0) {
  console.error(
    `Found ${failures.length} runtime i18n key lookup(s). Messages must be reached through the typed \`m\` namespace:\n\n${failures.join('\n\n')}\n`
  )
  process.exit(1)
}

console.log('No runtime i18n key resolvers found.')
