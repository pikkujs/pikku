#!/usr/bin/env node
// Removes leftover `*.bun-build` files — bun's incremental compile cache, which
// it writes next to the entry point as a hidden `.<hash>-00000000.bun-build` and
// does not clean up on its own.
//
// Why: each one is a full ~60 MB standalone snapshot, and a single afternoon of
// `bun build` runs leaves hundreds behind. They are gitignored and never
// published, so nothing breaks while they sit there — which is exactly why they
// go unnoticed until a checkout is tens of gigabytes. They also slow down every
// glob, `find`, and chokidar watch that walks the tree, and `pikku dev` watches
// the package directory.
//
// Safe by construction: only files whose name ends in `.bun-build` are ever
// touched, `node_modules` and `.git` are skipped, and anything git tracks is
// refused outright — a build artifact is never a tracked file, so a match there
// means the pattern caught something it should not have.
import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set(['node_modules', '.git'])

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const checkOnly = args.has('--check')

/** Every path git tracks, so the sweep can refuse to delete one. */
function trackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    return new Set(out.split('\0').filter(Boolean))
  } catch {
    // Not a git checkout (a published tarball, a CI cache restore). The name
    // pattern alone is still a sufficient guard.
    return new Set()
  }
}

/** Recursively collect every `*.bun-build` file, skipping node_modules/.git. */
function findArtifacts(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      findArtifacts(full, out)
    } else if (entry.isFile() && entry.name.endsWith('.bun-build')) {
      out.push(full)
    }
  }
  return out
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

const tracked = trackedFiles()
const artifacts = findArtifacts(ROOT)

if (artifacts.length === 0) {
  console.log('No *.bun-build artifacts found.')
  process.exit(0)
}

// Group by directory so the report says where the junk accumulates, rather than
// printing hundreds of hash-named paths nobody can read.
const byDir = new Map()
let totalBytes = 0
const refused = []

for (const file of artifacts) {
  const rel = relative(ROOT, file)
  if (tracked.has(rel)) {
    refused.push(rel)
    continue
  }
  let size = 0
  try {
    size = statSync(file).size
  } catch {
    continue
  }
  totalBytes += size
  const dir = dirname(rel) === '.' ? '<repo root>' : dirname(rel)
  const entry = byDir.get(dir) ?? { count: 0, bytes: 0, files: [] }
  entry.count++
  entry.bytes += size
  entry.files.push(file)
  byDir.set(dir, entry)
}

if (refused.length > 0) {
  console.error(
    `Refusing to run: ${refused.length} *.bun-build path(s) are tracked by git:`
  )
  for (const rel of refused) console.error(`  ${rel}`)
  console.error(
    'A build artifact should never be tracked — resolve that first.'
  )
  process.exit(1)
}

const verb = dryRun || checkOnly ? 'Found' : 'Removing'
console.log(
  `${verb} ${artifacts.length} *.bun-build artifact(s), ${formatBytes(totalBytes)}:`
)
for (const [dir, entry] of [...byDir].sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(
    `  ${dir.padEnd(40)} ${String(entry.count).padStart(4)} files  ${formatBytes(entry.bytes).padStart(9)}`
  )
}

if (checkOnly) {
  console.error(
    `\nRun \`yarn clean:bun-artifacts\` to reclaim ${formatBytes(totalBytes)}.`
  )
  process.exit(1)
}

if (dryRun) {
  console.log(`\nDry run — nothing deleted. Omit --dry-run to remove them.`)
  process.exit(0)
}

let removed = 0
let failed = 0
for (const entry of byDir.values()) {
  for (const file of entry.files) {
    try {
      unlinkSync(file)
      removed++
    } catch (e) {
      failed++
      console.error(`  failed: ${relative(ROOT, file)} — ${e.message}`)
    }
  }
}

console.log(
  `\nRemoved ${removed} file(s), reclaimed ${formatBytes(totalBytes)}.`
)
process.exit(failed > 0 ? 1 : 0)
