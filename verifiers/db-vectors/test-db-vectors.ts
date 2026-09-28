/**
 * Verifier for vector search on Pikku's embedded databases.
 *
 * Both extensions are loaded by default, so a project that writes a vector
 * table in a migration should never have to configure anything:
 *
 * - `pikku db migrate` creates a sqlite-vec (`vec0`) table under node, and
 *   under bun — which on macOS means the CLI swapped Apple's SQLite, built
 *   without extension loading, for one that has it.
 * - `pikku db migrate` creates a pgvector column in PGlite, and the data
 *   directory it leaves answers a `<->` query.
 * - A standalone artifact carries the extension with it. The node bundle and
 *   the compiled bun binary are each copied out of the repo — so nothing can
 *   resolve from a node_modules beside them — then run their own
 *   `db migrate` and answer a nearest-neighbour query over HTTP.
 *
 * The bun checks are skipped (not failed) when `bun` is not on PATH.
 */

import { execFileSync, spawn, type ChildProcess } from 'child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { createRequire } from 'module'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

const PROJECT_DIR = process.cwd()
const PGLITE_DIR = join(PROJECT_DIR, 'pglite')
const REPO_ROOT = join(PROJECT_DIR, '..', '..')
const CLI_DIR = join(REPO_ROOT, 'packages', 'cli')
const PIKKU_BIN = join(CLI_DIR, 'dist', 'bin', 'pikku.js')
const DIST_DIR = join(
  PROJECT_DIR,
  '.deploy',
  'standalone',
  'verifiers-db-vectors-dist'
)
const BINARY_NAME = 'verifiers-db-vectors'

function hasBun(): boolean {
  try {
    execFileSync('bun', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}
const BUN_AVAILABLE = hasBun()

const scratch = mkdtempSync(join(tmpdir(), 'pikku-db-vectors-'))
const children: ChildProcess[] = []
const cleanup = () => {
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  rmSync(scratch, { recursive: true, force: true })
}
process.on('exit', cleanup)
process.on('SIGINT', () => process.exit(130))
process.on('SIGTERM', () => process.exit(143))

/** Run a command and return everything it printed, throwing with it on failure. */
function run(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv }
): string {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 300_000,
    })
  } catch (error: any) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    throw new Error(
      `${command} ${args.join(' ')} failed:\n${tail(output || error.message)}`
    )
  }
}

const tail = (text: string, lines = 25) =>
  text
    .split('\n')
    .filter((line) => !line.includes('Skipping'))
    .slice(-lines)
    .map((line) => `      ${line}`)
    .join('\n')

function freshState() {
  for (const dir of [PROJECT_DIR, PGLITE_DIR]) {
    // `db migrate` also scaffolds db/annotations.ts, which imports its map by
    // absolute path and so is never committed.
    for (const generated of [
      '.pikku',
      '.pikku-runtime',
      '.deploy',
      'db/annotations.ts',
      'db/annotations.gen.json',
    ]) {
      rmSync(join(dir, generated), { recursive: true, force: true })
    }
  }
}

let failures = 0
const results: Array<{ name: string; passed: boolean; error?: string }> = []
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    results.push({ name, passed: true })
  } catch (e) {
    failures++
    results.push({ name, passed: false, error: (e as Error).message })
  }
}
const skip = (name: string, reason: string) =>
  results.push({ name: `${name} (skipped: ${reason})`, passed: true })

function assertApplied(output: string) {
  if (!/applied\s+0001-passages\.sql/.test(output))
    throw new Error(`The vector migration was not applied:\n${tail(output)}`)
}

// ---------------------------------------------------------------------------
// The CLI
// ---------------------------------------------------------------------------

console.log('Setting up: running pikku codegen...')
freshState()
run('node', [PIKKU_BIN], { cwd: PROJECT_DIR })
console.log('Setup complete.\n')

await check('cli (node): db migrate creates a vec0 table', () => {
  assertApplied(run('node', [PIKKU_BIN, 'db', 'migrate'], { cwd: PROJECT_DIR }))
})

if (BUN_AVAILABLE) {
  await check('cli (bun): db migrate creates a vec0 table', () => {
    rmSync(join(PROJECT_DIR, '.pikku-runtime'), {
      recursive: true,
      force: true,
    })
    const output = run('bun', [PIKKU_BIN, 'db', 'migrate'], {
      cwd: PROJECT_DIR,
    })
    // The fallback to Apple's SQLite is a warning, not an error, so it has to
    // be looked for — the migration would fail after it, but say why here.
    if (output.includes('SQLite extensions are unavailable'))
      throw new Error(
        `bun fell back to a SQLite that cannot load extensions:\n${tail(output)}`
      )
    assertApplied(output)
  })
} else {
  skip('cli (bun): db migrate creates a vec0 table', 'bun not on PATH')
}

await check('cli (PGlite): db migrate creates a pgvector column', () => {
  assertApplied(run('node', [PIKKU_BIN, 'db', 'migrate'], { cwd: PGLITE_DIR }))
})

await check('PGlite: the migrated database answers a <-> query', async () => {
  // The CLI's own copies, so the check reads the directory with the PGlite
  // that wrote it.
  const fromCli = createRequire(join(CLI_DIR, 'package.json'))
  const load = (specifier: string) =>
    import(pathToFileURL(fromCli.resolve(specifier)).href)
  const [{ PGlite }, { vector }, { pgcrypto }] = await Promise.all([
    load('@electric-sql/pglite'),
    load('@electric-sql/pglite-pgvector'),
    load('@electric-sql/pglite/contrib/pgcrypto'),
  ])
  const dataDir = join(PGLITE_DIR, '.pikku-runtime', 'dev-postgres')
  if (!existsSync(dataDir))
    throw new Error(`No PGlite data directory at ${dataDir}`)
  const db = new PGlite(dataDir, { extensions: { vector, pgcrypto } })
  try {
    await db.exec(`
      insert into passage (body, embedding) values
        ('north', '[1,0,0]'), ('east', '[0,1,0]'), ('up', '[0,0,1]');
    `)
    const { rows } = await db.query(
      `select body from passage order by embedding <-> '[0.9,0.2,0]' limit 2`
    )
    const bodies = rows.map((row: { body: string }) => row.body)
    if (bodies.join() !== 'north,east')
      throw new Error(`Expected [north, east], got ${JSON.stringify(bodies)}`)
  } finally {
    await db.close()
  }
})

// ---------------------------------------------------------------------------
// Standalone artifacts
// ---------------------------------------------------------------------------

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (typeof address === 'object' && address) {
        probe.close(() => resolve(address.port))
      } else {
        probe.close(() => reject(new Error('Could not allocate a free port')))
      }
    })
  })
}

/**
 * Copy the artifact out of the repo. Run in place, a bundle could resolve a
 * package — or an extension — from the project's node_modules and pass without
 * having shipped it.
 */
function isolate(name: string): string {
  const dir = join(scratch, name)
  cpSync(DIST_DIR, dir, { recursive: true })
  return dir
}

async function serve(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<{ url: string; stop: () => Promise<void> }> {
  const port = await getFreePort()
  const url = `http://127.0.0.1:${port}`
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: 'pipe',
  })
  children.push(child)
  let output = ''
  child.stdout?.on('data', (d) => (output += d.toString()))
  child.stderr?.on('data', (d) => (output += d.toString()))

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(interval)
      reject(new Error(`Server start timeout (15s):\n${tail(output)}`))
    }, 15_000)
    child.on('exit', (code) => {
      clearInterval(interval)
      clearTimeout(timeout)
      reject(new Error(`Server exited early (code ${code}):\n${tail(output)}`))
    })
    const interval = setInterval(async () => {
      try {
        await fetch(url)
        clearInterval(interval)
        clearTimeout(timeout)
        resolve()
      } catch {
        /* not listening yet */
      }
    }, 200)
  })

  return {
    url,
    stop: async () => {
      if (child.exitCode !== null) return
      child.removeAllListeners('exit')
      const closed = new Promise((resolve) => child.on('close', resolve))
      child.kill('SIGKILL')
      await closed
    },
  }
}

async function post(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`POST ${url} → ${res.status}: ${text}`)
  return JSON.parse(text)
}

/** Insert three unit vectors and ask for the two nearest to one of them. */
async function assertNearest(url: string) {
  const passages = [
    { id: 1, body: 'north', embedding: [1, 0, 0] },
    { id: 2, body: 'east', embedding: [0, 1, 0] },
    { id: 3, body: 'up', embedding: [0, 0, 1] },
  ]
  for (const passage of passages) await post(`${url}/passages`, passage)
  const { passages: nearest } = await post(`${url}/passages/nearest`, {
    embedding: [0.9, 0.2, 0],
    k: 2,
  })
  const bodies = nearest.map((row: { body: string }) => row.body)
  if (bodies.join() !== 'north,east')
    throw new Error(`Expected [north, east], got ${JSON.stringify(nearest)}`)
}

async function checkArtifact(
  label: string,
  dir: string,
  command: string,
  args: string[]
) {
  const dataDir = join(dir, 'data')
  const env = { PIKKU_DATA_DIR: dataDir }

  await check(`${label}: db migrate creates a vec0 table`, () => {
    const output = run(command, [...args, 'db', 'migrate'], { cwd: dir, env })
    if (!/applied\s+0001-passages\.sql/.test(output))
      throw new Error(`The vector migration was not applied:\n${tail(output)}`)
  })

  await check(`${label}: answers a nearest-neighbour query`, async () => {
    const server = await serve(command, args, dir, env)
    try {
      await assertNearest(server.url)
    } finally {
      await server.stop()
    }
  })
}

// --- node bundle ---
let nodeBuilt = false
await check('standalone (node): ships vec0 and the migrations', () => {
  run('node', [PIKKU_BIN, 'deploy', 'apply', '--provider', 'standalone'], {
    cwd: PROJECT_DIR,
  })
  for (const expected of ['bundle.js', 'sqlite-extensions', 'db/sqlite']) {
    if (!existsSync(join(DIST_DIR, expected)))
      throw new Error(`The artifact has no ${expected}`)
  }
  const shipped = readdirSync(join(DIST_DIR, 'sqlite-extensions'))
  if (!shipped.some((file) => file.startsWith('vec0.')))
    throw new Error(`No vec0 library shipped: ${shipped.join(', ')}`)
  nodeBuilt = true
})
if (nodeBuilt) {
  const dir = isolate('node')
  await checkArtifact('standalone (node)', dir, 'node', [
    join(dir, 'bundle.js'),
  ])
}

// --- compiled bun binary ---
if (BUN_AVAILABLE) {
  let bunBuilt = false
  await check('standalone (bun): compiles a binary', () => {
    rmSync(join(PROJECT_DIR, '.deploy'), { recursive: true, force: true })
    run(
      'node',
      [
        PIKKU_BIN,
        'deploy',
        'apply',
        '--provider',
        'standalone',
        '--runtime',
        'bun',
      ],
      { cwd: PROJECT_DIR }
    )
    if (!existsSync(join(DIST_DIR, BINARY_NAME)))
      throw new Error(`No ${BINARY_NAME} binary in ${DIST_DIR}`)
    bunBuilt = true
  })
  if (bunBuilt) {
    const dir = isolate('bun')
    await checkArtifact('standalone (bun)', dir, join(dir, BINARY_NAME), [])

    await check(
      'standalone (bun): writes its embedded libraries beside the database',
      () => {
        const extracted = join(dir, 'data', '.pikku-sqlite-extensions')
        if (!existsSync(extracted))
          throw new Error(`Nothing was written to ${extracted}`)
        const files = readdirSync(extracted, { recursive: true }).map(String)
        if (!files.some((file) => /(^|\/)vec0\./.test(file)))
          throw new Error(`No vec0 among ${files.join(', ')}`)
        // Only macOS needs a SQLite of its own: bun elsewhere links one that
        // loads extensions.
        if (
          process.platform === 'darwin' &&
          !files.some((file) => /(^|\/)libsqlite3/.test(file))
        )
          throw new Error(`No libsqlite3 among ${files.join(', ')}`)
      }
    )
  }
} else {
  skip('standalone (bun)', 'bun not on PATH')
}

freshState()

// --- Results ---
console.log('='.repeat(60))
console.log('Vector Extensions Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
