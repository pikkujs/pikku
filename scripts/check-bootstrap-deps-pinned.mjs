#!/usr/bin/env node
// Fails if `packages/cli/build.sh` bootstraps the published CLI without pinning
// the whole dependency tree by resolution date (`npm install --before=...`).
//
// Why: pinning PIKKU_CLI_VERSION alone is not enough. A published @pikku/cli
// declares its own @pikku/* dependencies with carets (e.g. @pikku/cli@0.12.35
// declares "@pikku/inspector": "^0.12.19"), so a later breaking release of any
// dependency retroactively breaks an already-pinned bootstrap — the pin buys
// nothing.
//
// This is not hypothetical: #972 published @pikku/inspector@0.12.43, which
// dropped `http.routePermissions`. The pinned CLI 0.12.35 then resolved that
// July inspector at bootstrap time and died with
// `TypeError: Cannot read properties of undefined (reading 'size')` at
// pikku-command-permissions.js:11 (`state.http.routePermissions.size`), which
// broke build.sh on main for everyone (#985).
//
// `npm install --before=<date>` resolves every package to the version that was
// current at that date, keeping the bootstrap internally consistent no matter
// what is published afterwards.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUILD_SH = join(ROOT, 'packages/cli/build.sh')

if (!existsSync(BUILD_SH)) {
  console.error(`✖ ${BUILD_SH} not found`)
  process.exit(1)
}

const body = readFileSync(BUILD_SH, 'utf8')
const lines = body.split('\n')

const violations = []

// A bootstrap install is one that resolves a dependency tree into the throwaway
// bootstrap dir. This deliberately ignores `npm install -g` mentioned inside the
// update-notifier's message string, which installs nothing at build time.
const isBootstrapInstall = (text) =>
  /\bnpm\s+install\b/.test(text) &&
  !/^\s*#/.test(text) &&
  (/_bootstrap_dir/.test(text) || /--no-save|--no-package-lock/.test(text))

const installLines = lines
  .map((text, i) => ({ text, line: i + 1 }))
  .filter(({ text }) => isBootstrapInstall(text))

if (installLines.length === 0) {
  violations.push(
    'no bootstrap `npm install` found — has the bootstrap been restructured?'
  )
}

for (const { text, line } of installLines) {
  if (!/--before[= ]/.test(text)) {
    violations.push(
      `build.sh:${line} — \`npm install\` without \`--before=\`: ${text.trim()}`
    )
  }
}

// The date must have a default, so the build is reproducible without the
// caller having to know to set it.
if (!/^\s*:\s*"\$\{PIKKU_BOOTSTRAP_BEFORE:=[^}]+\}"/m.test(body)) {
  violations.push(
    'PIKKU_BOOTSTRAP_BEFORE has no default value (`: "${PIKKU_BOOTSTRAP_BEFORE:=...}"`)'
  )
}

if (violations.length > 0) {
  console.error('\n✖ CLI bootstrap does not pin its dependency tree:\n')
  for (const v of violations) console.error(`  ${v}`)
  console.error(
    '\nPinning PIKKU_CLI_VERSION alone does not pin the CLI`s own @pikku/*' +
      '\ndependencies — they are declared with carets and float forward, so any' +
      '\nlater breaking release retroactively breaks the bootstrap (#985).' +
      '\nResolve the whole tree as of the CLI pin`s publish date instead:' +
      '\n\n  npm install --no-save --no-package-lock --before="${PIKKU_BOOTSTRAP_BEFORE}"\n'
  )
  process.exit(1)
}

console.log('✓ CLI bootstrap pins its dependency tree by resolution date')
