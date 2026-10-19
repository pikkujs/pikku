// Local dev runner: the API (pikku) and the frontend (vite) together.
//
// Two things this handles that a plain `bun run` cannot:
//  - `.env` is parsed HERE and passed explicitly to both children. The pikku CLI
//    has a node shebang, so bun's implicit .env loading never reaches it, and
//    Better Auth then fails sign-up with an opaque "Requested secret not found".
//  - BETTER_AUTH_SECRET is generated on first run. A committed one would be the
//    same secret in every scaffold; a missing one is a 500 on the first sign-up.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, '.env')

if (!existsSync(envPath)) {
  writeFileSync(
    envPath,
    [
      '# Local development only — this file is gitignored and never deployed.',
      '# Deployed stages get their own secrets injected by the platform.',
      `BETTER_AUTH_SECRET=${randomBytes(32).toString('base64')}`,
      '',
    ].join('\n'),
  )
  console.log('dev: generated .env with a fresh BETTER_AUTH_SECRET')
}

const env = { ...process.env }
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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
const children = [
  spawn('bunx', ['--bun', 'pikku', 'dev'], { cwd: root, env, stdio: 'inherit' }),
  spawn('bun', ['run', '--filter', '@project/app', 'dev'], { cwd: root, env, stdio: 'inherit' }),
]

// One child dying takes the whole dev session with it — a half-running stack
// (frontend up, API down) looks like an app bug and wastes debugging time.
let shuttingDown = false
const shutdown = (code) => {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill('SIGTERM')
  process.exit(code)
}

for (const child of children) {
  child.on('exit', (code) => shutdown(code ?? 0))
  child.on('error', (err) => {
    console.error(`dev: failed to start a process: ${err.message}`)
    shutdown(1)
  })
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
