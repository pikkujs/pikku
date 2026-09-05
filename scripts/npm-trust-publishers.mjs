#!/usr/bin/env node
// Points every publishable package's npm trusted publisher at this repo's
// publish workflow, so `yarn npm publish` authenticates over OIDC instead of a
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
//   node scripts/npm-trust-publishers.mjs --dry-run   # print the plan
//   node scripts/npm-trust-publishers.mjs             # apply it
//   node scripts/npm-trust-publishers.mjs --list      # show current state
//
// Every mode reads the current configuration from the registry first, so even
// `--dry-run` needs to be logged in.
//
// Run it from a real terminal. Every call to this endpoint is 2FA-gated, and
// npm answers that by printing a URL and polling until the browser confirms —
// a flow that needs a TTY. Without one all 68 packages fail `EOTP` in a
// fraction of a second. `--otp=<code>` from an authenticator app skips the
// browser round trip; npm keeps an accepted code usable for a few minutes,
// which is why this is one loop rather than 68 invocations.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const REPO = 'pikkujs/pikku'
// The filename, not the workflow's `name:`. npm stores it as the
// `workflow_ref.file` claim and matches it against the OIDC token GitHub mints
// for the running job, so the workflow file that actually calls
// `changeset publish` is the only one that can authenticate.
//
// That used to be `main.yml`. #1599 moved publishing into `publish.yml` so a
// merge to main could not cancel a release mid-flight, and left every package's
// trust entry naming a file that no longer publishes. The symptom is not a
// permissions error: yarn falls through to "no credentials at all" and every
// package dies on `YN0033: No authentication configured for request`.
const WORKFLOW = 'publish.yml'

// Every directory a publishable package can live in. `templates/`, `verifiers/`
// and `e2e/` are private by definition, so they are not walked at all.
const PACKAGE_ROOTS = ['packages']

const argv = process.argv.slice(2)
const args = new Set(argv)
const dryRun = args.has('--dry-run')
const list = args.has('--list')
const otp = argv.find((a) => a.startsWith('--otp='))?.slice('--otp='.length)
// Through the environment rather than the command line. Each `npm trust`
// subcommand declares the flags it accepts and `otp` is not among them, so
// `--otp 123456` leaves the code to be read as a second positional argument
// and every call dies on `Unknown positional argument`. `npm_config_otp` is
// the same config key by another route, and npm applies it whatever the
// subcommand declares.
//
// It goes to every call rather than the first, because npm authenticates each
// request separately; a code npm has already accepted stays good for the rest
// of the window.
const env = otp ? { ...process.env, npm_config_otp: otp } : process.env

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

const run = (command) =>
  execFileSync('npm', command, { stdio: 'inherit', cwd: ROOT, env })
const capture = (command) =>
  execFileSync('npm', command, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  })

// `npm trust list --json` prints one JSON object per configuration rather than
// one array, so two configurations arrive as two concatenated objects that
// `JSON.parse` refuses. Split them on brace depth, ignoring braces inside
// strings.
function parseConfigs(text) {
  const configs = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        try {
          configs.push(JSON.parse(text.slice(start, i + 1)))
        } catch {
          // Not a configuration object — npm prints nothing else on stdout
          // under --json, so this only fires if that ever changes.
        }
        start = -1
      }
    }
  }
  return configs
}

const wanted = (config) =>
  config.type === 'github' &&
  config.repository === REPO &&
  config.file === WORKFLOW

// A one-time password is good for the ~30 seconds of its own step, which
// covers roughly 15 packages at three requests each — so a full run is
// expected to be cut short, and the interesting question is where. The loop
// stops at the first failure instead of grinding through the rest and
// reporting fifty identical `EOTP`s, and names the package to resume from.
// `--from` then skips everything before it, so the next code is spent on work
// rather than on re-reading what is already correct.
const from = argv.find((a) => a.startsWith('--from='))?.slice('--from='.length)

// `--only=a,b` narrows the run to the packages named. What a release actually
// needs is much smaller than the whole set: `changeset publish` skips every
// version already on the registry, so only the packages being published have
// to authenticate, and those fit comfortably inside one window.
const only = argv
  .find((a) => a.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
  .filter(Boolean)

if (only) {
  const unknown = only.filter((name) => !names.includes(name))
  if (unknown.length) {
    console.error(`Not publishable packages: ${unknown.join(', ')}`)
    process.exit(1)
  }
}

let resumeAt = null
for (const name of names) {
  if (resumeAt) break
  if (from && name < from) continue
  if (only && !only.includes(name)) continue

  if (list) {
    try {
      run(['trust', 'list', name])
    } catch {
      resumeAt = name
    }
    continue
  }

  // npm allows one trusted publisher per package and errors rather than
  // updating, so re-pointing an existing entry means revoking it first. Reading
  // the current state also makes the script idempotent: a package already on
  // the right workflow is left alone, which matters because the whole loop runs
  // inside one 2FA window.
  // A package with no trust configuration is not an error — npm says so and
  // exits 0 — so a non-zero exit here is a real failure, `EOTP` most often.
  // Reading that as "nothing configured" would plan an add for a package that
  // already has an entry, and npm errors rather than updating one, so the run
  // would fail a second time behind a much less obvious message.
  let existing
  try {
    existing = parseConfigs(capture(['trust', 'list', name, '--json']))
  } catch {
    resumeAt = name
    break
  }

  const stale = existing.filter((config) => config.id && !wanted(config))
  const alreadyCorrect = existing.some(wanted)

  if (alreadyCorrect && stale.length === 0) {
    console.log(`${name}: already ${REPO}/${WORKFLOW}`)
    continue
  }

  const plan = [
    ...stale.map((config) => [
      'trust',
      'revoke',
      name,
      '--id',
      String(config.id),
    ]),
    ...(alreadyCorrect
      ? []
      : [
          [
            'trust',
            'github',
            name,
            '--file',
            WORKFLOW,
            '--repo',
            REPO,
            '--allow-publish',
            '--yes',
          ],
        ]),
  ]

  if (dryRun) {
    for (const step of plan) console.log(`npm ${step.join(' ')}`)
    continue
  }

  try {
    for (const step of plan) run(step)
  } catch {
    // The revoke is issued before the add, so a code that dies between the two
    // would leave the package with no trusted publisher at all. Resuming from
    // this name re-reads it and adds what is missing.
    resumeAt = name
    break
  }
}

if (resumeAt) {
  console.error(`\nStopped at ${resumeAt} — the one-time password expired.`)
  console.error(
    'Re-run with a fresh code, from where this one stopped:\n' +
      `  node scripts/npm-trust-publishers.mjs --from=${resumeAt} --otp=<code>\n` +
      '\nInspect or clear a single package by hand with:\n' +
      '  npm trust list <pkg>\n' +
      '  npm trust revoke <pkg> --id <trust-id>'
  )
  process.exit(1)
}

if (!dryRun && !list) {
  console.log('\nAll packages configured.')
}
