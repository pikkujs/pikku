#!/usr/bin/env node
// Points every publishable package's npm trusted publisher at this repo's
// Release workflow, so `yarn npm publish` authenticates over OIDC instead of a
// token.
//
// Why a script: a trusted publisher is configured per package, and there are
// ~70 of them. The npm UI would be that many identical forms; `npm trust` is
// the same operation from the CLI, and doing them in one loop means one 2FA
// prompt rather than one per package (npm opens a ~5 minute window after the
// first).
//
// This cannot run in CI. `npm trust` refuses granular access tokens that bypass
// 2FA, so it needs a human-authenticated `npm login` with 2FA on the account.
//
//   node scripts/npm-trust-publishers.mjs --dry-run   # print the commands
//   node scripts/npm-trust-publishers.mjs             # apply them
//   node scripts/npm-trust-publishers.mjs --list      # show current state
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const REPO = 'pikkujs/pikku'
// The filename, not the workflow's `name:`. npm matches the path under
// `.github/`, so the "Release" workflow is `main.yml` here.
const WORKFLOW = 'main.yml'

// Every directory a publishable package can live in. `templates/`, `verifiers/`
// and `e2e/` are private by definition, so they are not walked at all.
const PACKAGE_ROOTS = ['packages']

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const list = args.has('--list')

function findPackageJsons(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.deploy')
      continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) findPackageJsons(full, out)
    else if (entry === 'package.json') out.push(full)
  }
  return out
}

const names = []
for (const root of PACKAGE_ROOTS) {
  for (const file of findPackageJsons(join(ROOT, root))) {
    let pkg
    try {
      pkg = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    if (pkg.private === true || !pkg.name) continue
    names.push(pkg.name)
  }
}
names.sort()

if (names.length === 0) {
  console.error('No publishable packages found — refusing to continue.')
  process.exit(1)
}

console.log(`${names.length} publishable packages`)
console.log(`  repo:     ${REPO}`)
console.log(`  workflow: ${WORKFLOW}\n`)

const run = (argv) => execFileSync('npm', argv, { stdio: 'inherit', cwd: ROOT })

const failures = []
for (const name of names) {
  const argv = list
    ? ['trust', 'list', name]
    : [
        'trust',
        'github',
        name,
        '--file',
        WORKFLOW,
        '--repo',
        REPO,
        '--allow-publish',
        '--yes',
      ]

  if (dryRun) {
    console.log(`npm ${argv.join(' ')}`)
    continue
  }

  try {
    run(argv)
  } catch {
    // Keep going: npm allows one trusted publisher per package, so a package
    // that already has one errors rather than updating. Collecting them and
    // reporting at the end beats stopping the loop and re-prompting for 2FA.
    failures.push(name)
  }
}

if (failures.length) {
  console.error(`\n${failures.length} package(s) did not apply:`)
  for (const name of failures) console.error(`  ${name}`)
  console.error(
    '\nA package that already has a trusted publisher must be revoked first:\n' +
      '  npm trust list <pkg>\n' +
      '  npm trust revoke <pkg> --id <trust-id>'
  )
  process.exit(1)
}

if (!dryRun && !list) {
  console.log('\nAll packages configured.')
}
