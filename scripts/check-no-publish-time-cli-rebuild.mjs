#!/usr/bin/env node
// Fails if any publishable package rebuilds via the workspace `pikku` CLI from
// one of its npm publish-lifecycle scripts (`prepublishOnly` / `prepare` /
// `prepack`).
//
// Why: `npx changeset publish` runs up to 10 `npm publish` processes
// concurrently (NPM_PUBLISH_CONCURRENCY_LIMIT, no 2FA with an automation
// token). `@pikku/cli`'s publish build (`build.sh`) starts with
// `rm -rf -- .pikku dist`, so any sibling whose publish build invokes the
// workspace CLI (`pikku all`, or a `build.sh` that runs
// `cli/dist/bin/pikku.js`) can read `packages/cli/dist` mid-wipe and fail with
// `Cannot find module '.../cli/dist/src/services.js'`. This raced
// `@pikku/addon-console` against `@pikku/cli` and broke the release.
//
// `yarn release` already fully builds every package (`build:packages` →
// `build:addons` → `build:console`) BEFORE `npx changeset publish`, and that
// build job propagates tsc/pikku failures (foreach returns non-zero), so a
// publish-time rebuild is both redundant and racy. Published packages must not
// run the workspace CLI from a publish-lifecycle script.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLISH_LIFECYCLE = ['prepublishOnly', 'prepare', 'prepack']

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

/** Split a shell command into its `&&` / `||` / `;` / `|` / `()` segments. */
function segments(command) {
  return command
    .split(/&&|\|\||[;|()]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** First executable token of a segment, ignoring `FOO=bar` env prefixes. */
function executable(segment) {
  const tokens = segment.split(/\s+/)
  for (const token of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue
    return token
  }
  return ''
}

function runsWorkspaceCli(segment) {
  const exe = executable(segment)
  if (exe === 'pikku') return true
  if (/cli\/dist\/bin\/pikku\.js/.test(segment)) return true
  return false
}

/** Scan a referenced shell script for workspace-CLI invocations. */
function shellFileRunsCli(file) {
  let body
  try {
    body = readFileSync(file, 'utf8')
  } catch {
    return false
  }
  return body.split('\n').some((line) => segments(line).some(runsWorkspaceCli))
}

/**
 * Resolve a script to its leaf commands, following intra-package
 * `yarn <name>` / `yarn run <name>` / `npm run <name>` references, and report
 * whether any leaf invokes the workspace CLI (directly or via a `*.sh` file).
 */
function scriptRunsCli(scriptName, scripts, pkgDir, seen = new Set()) {
  if (seen.has(scriptName)) return false
  seen.add(scriptName)
  const command = scripts[scriptName]
  if (!command) return false
  for (const segment of segments(command)) {
    const exe = executable(segment)
    const refMatch = segment.match(/^(?:yarn(?:\s+run)?|npm\s+run)\s+(\S+)/)
    if (refMatch && scripts[refMatch[1]]) {
      if (scriptRunsCli(refMatch[1], scripts, pkgDir, seen)) return true
      continue
    }
    if (runsWorkspaceCli(segment)) return true
    if (/\.sh\b/.test(exe) || exe.endsWith('.sh')) {
      const shFile = join(pkgDir, exe.replace(/^\.\//, ''))
      if (existsSync(shFile) && shellFileRunsCli(shFile)) return true
    }
    for (const token of segment.split(/\s+/)) {
      if (token.endsWith('.sh')) {
        const shFile = join(pkgDir, token.replace(/^\.\//, ''))
        if (existsSync(shFile) && shellFileRunsCli(shFile)) return true
      }
    }
  }
  return false
}

const violations = []
for (const file of findPackageJsons(join(ROOT, 'packages'))) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    continue
  }
  if (pkg.private === true) continue
  const scripts = pkg.scripts || {}
  const pkgDir = dirname(file)
  for (const lifecycle of PUBLISH_LIFECYCLE) {
    if (!scripts[lifecycle]) continue
    if (scriptRunsCli(lifecycle, scripts, pkgDir)) {
      violations.push(
        `${file.replace(ROOT + '/', '')} → "${lifecycle}" rebuilds via the workspace pikku CLI`
      )
    }
  }
}

if (violations.length > 0) {
  console.error(
    '\n✖ published package rebuilds via the workspace pikku CLI at publish time:\n'
  )
  for (const v of violations) console.error(`  ${v}`)
  console.error(
    '\n`npx changeset publish` runs npm publish concurrently, and @pikku/cli`s' +
      '\npublish build wipes packages/cli/dist (rm -rf), so a sibling that runs' +
      '\nthe workspace CLI during publish races the wipe and fails with' +
      '\n"Cannot find module .../cli/dist/src/services.js". `yarn release` already' +
      '\nbuilds every package before publishing, so drop the publish-lifecycle' +
      '\nrebuild (e.g. remove `prepublishOnly`) instead.\n'
  )
  process.exit(1)
}

console.log(
  '✓ no published package rebuilds via the workspace pikku CLI at publish time'
)
