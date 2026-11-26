#!/usr/bin/env node
// Fails if any publishable package's `repository` field is missing, points at a
// repo other than this one, or names the wrong directory.
//
// Why this is a gate: every publish here is signed with sigstore provenance, and
// npm refuses a provenance-signed tarball whose package.json repository.url does
// not match the URL in the bundle — `E422 ... "repository.url" is "", expected to
// match "https://github.com/pikkujs/pikku"`. Worse, `changeset publish` does
// `break publishChunks` on the first failure, so every package it had not reached
// yet is abandoned WITHOUT being named. One missing field is therefore silent for
// every package behind it: `pikku` took @pikku/cli, @pikku/console and
// @pikku/kysely-node-sqlite down with it, and once that was fixed the brand-new
// @pikku/react-layout-panel did the same to @pikku/cli and @pikku/console again.
// The registry is the wrong place to discover this.
//
// Run with --fix to write the correct field into any package missing it.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIX = process.argv.includes('--fix')

const REPO_URL = 'git+https://github.com/pikkujs/pikku.git'

/** npm compares the provenance repo after stripping the git+ and .git noise. */
function normalize(url) {
  return String(url)
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
}

const EXPECTED = normalize(REPO_URL)

function findPackageJsons(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', '.deploy', '.pikku', '.next'].includes(entry)) {
      continue
    }
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) findPackageJsons(full, out)
    else if (entry === 'package.json') out.push(full)
  }
  return out
}

const problems = []
const fixed = []
let checked = 0

for (const file of findPackageJsons(join(ROOT, 'packages'))) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    continue
  }
  if (pkg.private || !pkg.name) continue
  checked++

  const where = relative(ROOT, file)
  const directory = relative(ROOT, dirname(file)).split(sep).join('/')
  const repository = pkg.repository
  const url = typeof repository === 'string' ? repository : repository?.url

  if (!url) {
    if (FIX) {
      const next = {}
      for (const [key, value] of Object.entries(pkg)) {
        next[key] = value
        if (key === 'version') {
          next.repository = { type: 'git', url: REPO_URL, directory }
        }
      }
      if (!next.repository) {
        next.repository = { type: 'git', url: REPO_URL, directory }
      }
      writeFileSync(file, JSON.stringify(next, null, 2) + '\n')
      fixed.push(where)
    } else {
      problems.push(
        `${where}: no "repository" field — npm rejects the provenance-signed publish`
      )
    }
    continue
  }

  if (normalize(url) !== EXPECTED) {
    problems.push(`${where}: repository.url is "${url}", expected ${EXPECTED}`)
  }
  if (typeof repository === 'object' && repository.directory !== directory) {
    problems.push(
      `${where}: repository.directory is "${repository.directory ?? ''}", expected "${directory}"`
    )
  }
}

if (fixed.length > 0) {
  console.log(`Wrote repository field for:\n  ${fixed.join('\n  ')}`)
}
if (problems.length > 0) {
  console.error(
    `Repository metadata would fail npm provenance:\n  ${problems.join('\n  ')}\n` +
      `Run \`bun run check:repository --fix\` to write the missing ones.`
  )
  process.exit(1)
}
console.log(`✓ ${checked} publishable packages: repository field is publishable`)
