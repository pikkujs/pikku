#!/usr/bin/env node
// Fails if any publishable package declares a `workspace:` range in a field
// that ships to npm (dependencies / peerDependencies / optionalDependencies).
//
// Why: our publish path (`npx changeset publish`) does NOT rewrite the
// `workspace:` protocol to a concrete version, so any such range leaks verbatim
// into the published package.json. A consumer that installs it then hits
// `Workspace not found (<pkg>@workspace:*)` and the install fails (it leaked
// into `@pikku/cli@0.12.36` via `@pikku/better-auth: workspace:*`). The repo
// convention is literal caret ranges (e.g. `^0.12.6`); yarn still links those
// to the local workspace during development when the version satisfies the
// range, so there is no reason to use the workspace protocol in a published
// field. `devDependencies` are stripped on publish, so they may keep
// `workspace:`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLISHED_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
]

/** Recursively collect every package.json under packages/, skipping node_modules/dist. */
function findPackageJsons(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.deploy')
      continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) findPackageJsons(full, out)
    else if (entry === 'package.json') out.push(full)
  }
  return out
}

const violations = []
for (const file of findPackageJsons(join(ROOT, 'packages'))) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    continue
  }
  if (pkg.private === true) continue // private packages are never published
  for (const field of PUBLISHED_FIELDS) {
    const deps = pkg[field]
    if (!deps) continue
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        violations.push(
          `${file.replace(ROOT + '/', '')} → ${field}["${name}"] = "${range}"`
        )
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    '\n✖ workspace: protocol found in published dependency fields:\n'
  )
  for (const v of violations) console.error(`  ${v}`)
  console.error(
    '\nReplace each with a literal version range (e.g. "^0.12.6"). The publish' +
      '\nstep does not rewrite workspace: ranges, so they leak to npm and break' +
      '\nconsumer installs. (devDependencies are exempt — they are not published.)\n'
  )
  process.exit(1)
}

console.log('✓ no workspace: protocol in published dependency fields')
