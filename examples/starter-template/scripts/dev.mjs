// Local dev runner: the API (pikku) and the frontend (vite) together.
//
// Two things this handles that a plain `bun run` cannot:
//  - `.env` is parsed HERE and passed explicitly to both children. The pikku CLI
//    has a node shebang, so bun's implicit .env loading never reaches it, and
//    Better Auth then fails sign-up with an opaque "Requested secret not found".
//  - The per-project secrets are generated on first run. A committed one would be
//    the same secret in every scaffold; a missing one breaks sign-in.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, '.env')

// A missing BETTER_AUTH_SECRET is a 500 on the first sign-up; a missing
// SCENARIO_ACTOR_SECRET disables /api/auth/sign-in/actor, which fails every scenario
// at sign-in. Appended rather than written once, so a project scaffolded before one of
// these was added here still picks it up.
const generatedSecrets = ['BETTER_AUTH_SECRET', 'SCENARIO_ACTOR_SECRET']

if (!existsSync(envPath)) {
  writeFileSync(
    envPath,
    [
      '# Local development only — this file is gitignored and never deployed.',
      '# Deployed stages get their own secrets injected by the platform.',
      '',
    ].join('\n'),
  )
}

let envFile = readFileSync(envPath, 'utf8')
if (envFile.length > 0 && !envFile.endsWith('\n')) envFile += '\n'
const missingSecrets = generatedSecrets.filter(
  (name) => !new RegExp(`^\\s*${name}\\s*=`, 'm').test(envFile),
)
if (missingSecrets.length > 0) {
  envFile += `${missingSecrets.map((name) => `${name}=${randomBytes(32).toString('base64')}`).join('\n')}\n`
  writeFileSync(envPath, envFile)
  console.log(`dev: generated ${missingSecrets.join(', ')} in .env`)
}

const env = { ...process.env }
for (const line of envFile.split('\n')) {
  const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
  if (!match) continue
  const value = match[2].trim().replace(/^["']|["']$/g, '')
  env[match[1]] ??= value
}

// `--bun` is load-bearing: the pikku CLI has a `#!/usr/bin/env node` shebang, so a
// node on PATH is used even under bunx. The CLI opens the local database with
// `node:sqlite`, which node only ships unflagged from 24 — on anything older this
// dies with `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module: node:sqlite`.
// `--bun` ignores the shebang and runs it on bun, which has that module.
const spawnApi = () =>
  spawn('bunx', ['--bun', 'pikku', 'dev'], { cwd: root, env, stdio: 'inherit' })
const spawnFrontend = () =>
  spawn('bun', ['run', '--filter', '@project/app', 'dev'], { cwd: root, env, stdio: 'inherit' })

// One child dying takes the whole dev session with it — a half-running stack
// (frontend up, API down) looks like an app bug and wastes debugging time.
const children = []
let shuttingDown = false
const shutdown = (code) => {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill('SIGTERM')
  process.exit(code)
}

const supervise = (child) => {
  child.on('exit', (code) => shutdown(code ?? 0))
  child.on('error', (err) => {
    console.error(`dev: failed to start a process: ${err.message}`)
    shutdown(1)
  })
  return child
}

children.push(supervise(spawnApi()), supervise(spawnFrontend()))

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
