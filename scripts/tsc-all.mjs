// The root `bun run tsc`: every workspace's `tsc` script, always through the
// @pikku/tsc dispatcher.
//
// recipes/* and templates/* declare their own `typescript` (their package.json is
// copied into a user's app), so `bun run tsc` inside one puts that local binary
// ahead of the root alias and PIKKU_TSC is ignored. The filtered run therefore
// leaves them out, and their `tsc` script, always a bare `tsc [args]`, runs here
// by calling the dispatcher with the same args. Both parts always run, so one
// failure does not hide the other's.
//
//   node scripts/tsc-all.mjs
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dispatcher = join(root, 'packages/tsc/bin/tsc.mjs')
const JOBS = 4

const filtered = await new Promise((done) => {
  const child = spawn('bun', ['run', '--filter', '*', '--filter', '!./recipes/**', '--filter', '!./templates/**', 'tsc'], {
    cwd: root,
    stdio: 'inherit',
  })
  child.on('close', (code) => done(code ?? 1))
})

const tracked = await new Promise((done, fail) => {
  let out = ''
  const git = spawn('git', ['ls-files', 'recipes', 'templates'], { cwd: root })
  git.stdout.on('data', (c) => (out += c))
  git.on('error', fail)
  git.on('close', () => done(out.split('\n')))
})

// Directories the root leaves out of the workspaces with a `!` pattern.
const excluded = new Set(
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces.packages.filter((w) => w.startsWith('!')).map((w) => w.slice(1))
)

const jobs = []
for (const file of tracked) {
  const m = file.match(/^((?:recipes|templates)\/[^/]+)\/package\.json$/)
  if (!m || excluded.has(m[1]) || !existsSync(join(root, file))) continue
  const script = JSON.parse(readFileSync(join(root, file), 'utf8')).scripts?.tsc
  if (script === undefined) continue
  const parsed = script.match(/^tsc((?: [^&|;<>$`]+)?)$/)
  if (!parsed) {
    console.error(`${m[1]}: its tsc script is "${script}", not a bare tsc; teach scripts/tsc-user-apps.mjs about it`)
    process.exit(1)
  }
  jobs.push({ name: m[1], args: parsed[1].trim().split(/\s+/).filter(Boolean) })
}

const run = ({ name, args }) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [dispatcher, ...args], { cwd: join(root, name), stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (out += c))
    child.on('close', (code) => {
      for (const line of out.split('\n').filter(Boolean)) console.log(`${name} tsc: ${line}`)
      console.log(`${name} tsc: Exited with code ${code}`)
      done({ name, code })
    })
  })

const results = []
const queue = [...jobs]
await Promise.all(
  Array.from({ length: JOBS }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) results.push(await run(job))
  })
)
const failed = results.filter((r) => r.code !== 0)
console.log(`${results.length} workspaces under recipes/ and templates/, ${failed.length} failed`)
process.exit(filtered !== 0 || failed.length ? 1 : 0)
