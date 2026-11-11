/**
 * Verifier for the NATS contributor in a standalone deploy.
 *
 * Builds this tiny app with `pikku deploy plan --provider standalone`, which
 * must select the `nats` contributor of @pikku/queue-nats (opted in with
 * wireContributors, not an addon) in place of the in-memory queue and
 * scheduler. Then runs the bundle against a real nats-server (2.14+, with
 * JetStream) and proves a job round trip, a cron fire, a refusal to start
 * without NATS_URL or PIKKU_APP_SLUG, and that stopping drains an in-flight job.
 *
 * The server comes from NATS_SERVER_BIN or PATH. Without one, or without bun,
 * the runtime checks are skipped and the build checks still run.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HERE = process.cwd()
const PIKKU_BIN = join(
  HERE,
  '..',
  '..',
  'packages',
  'cli',
  'dist',
  'bin',
  'pikku.js'
)
const UNIT_DIR = join(
  HERE,
  '.deploy',
  'standalone',
  'verifiers-deploy-standalone-nats'
)

const tryRun = (cmd: string, args: string[]): string | undefined => {
  try {
    return execFileSync(cmd, args, { stdio: 'pipe' }).toString()
  } catch {
    return undefined
  }
}
const NATS_BIN = process.env.NATS_SERVER_BIN ?? 'nats-server'
const natsVersion = tryRun(NATS_BIN, ['--version'])?.match(
  /v(\d+)\.(\d+)\.(\d+)/
)
const natsOk =
  natsVersion !== undefined &&
  natsVersion !== null &&
  (Number(natsVersion[1]) > 2 ||
    (Number(natsVersion[1]) === 2 && Number(natsVersion[2]) >= 14))
const bunOk = tryRun('bun', ['--version']) !== undefined

let failures = 0
const check = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failures++
    console.log(`  ✗ ${name}\n      ${(error as Error).message}`)
  }
}
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })
const until = async (
  what: string,
  ok: () => boolean | Promise<boolean>,
  ms = 20_000
) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await ok()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`timed out waiting for ${what}`)
}

console.log('Setting up: pikku all + deploy plan (standalone)...')
rmSync(join(HERE, '.deploy'), { recursive: true, force: true })
rmSync(join(HERE, '.pikku'), { recursive: true, force: true })
execFileSync('node', [PIKKU_BIN, 'all'], {
  cwd: HERE,
  stdio: 'pipe',
  timeout: 120_000,
})
execFileSync(
  'node',
  [
    PIKKU_BIN,
    'deploy',
    'plan',
    '--provider',
    'standalone',
    '--result-file',
    '.deploy/standalone/plan-result.json',
  ],
  { cwd: HERE, stdio: 'pipe', timeout: 300_000 }
)

await check(
  'build: the nats contributor is selected from wireContributors',
  () => {
    const generated = readFileSync(
      join(UNIT_DIR, 'platform-services.gen.ts'),
      'utf-8'
    )
    if (
      !/import \{ natsDeploy as contributor0 \} from ".*queue-nats.*nats-contributor/.test(
        generated
      )
    )
      throw new Error(`natsDeploy was not imported:\n${generated}`)
    if (!generated.includes('"needsQueue":true'))
      throw new Error('the platform did not report the queue')
  }
)

await check('build: the bundle carries the contributor', () => {
  const bundle = readFileSync(join(UNIT_DIR, 'bundle.js'), 'utf-8')
  if (!bundle.includes('PIKKU_APP_SLUG'))
    throw new Error('contributor not bundled')
})

if (!natsOk || !bunOk) {
  console.log(
    `\nSkipping runtime checks: ${!bunOk ? 'bun not on PATH' : 'no nats-server >= 2.14 (set NATS_SERVER_BIN)'}.`
  )
} else {
  const storeDir = mkdtempSync(join(tmpdir(), 'pikku-nats-verifier-'))
  const natsPort = await freePort()
  const monitorPort = await freePort()
  const procs: ChildProcess[] = []
  const nats = spawn(
    NATS_BIN,
    ['-js', '-sd', storeDir, '-p', String(natsPort), '-m', String(monitorPort)],
    {
      stdio: 'ignore',
    }
  )
  procs.push(nats)
  const natsUrl = `nats://127.0.0.1:${natsPort}`
  const cleanup = () => {
    for (const proc of procs) proc.kill('SIGKILL')
    rmSync(storeDir, { recursive: true, force: true })
  }
  process.on('exit', cleanup)

  const run = (env: Record<string, string>) => {
    const proc = spawn('bun', [join(UNIT_DIR, 'bundle.js')], {
      cwd: UNIT_DIR,
      env: { ...process.env, HOST: '127.0.0.1', ...env },
      stdio: 'pipe',
    })
    procs.push(proc)
    let output = ''
    proc.stdout?.on('data', (d) => (output += d))
    proc.stderr?.on('data', (d) => (output += d))
    const exited = new Promise<number | null>((resolve) =>
      proc.on('exit', resolve)
    )
    return { proc, exited, output: () => output }
  }

  try {
    await until('nats-server', async () => {
      try {
        return (await fetch(`http://127.0.0.1:${monitorPort}/healthz`)).ok
      } catch {
        return false
      }
    })

    for (const [missing, env] of [
      ['NATS_URL', { PIKKU_APP_SLUG: 'verifier' }],
      ['PIKKU_APP_SLUG', { NATS_URL: natsUrl }],
    ] as const) {
      await check(`refuses to start without ${missing}`, async () => {
        const app = run({ PORT: String(await freePort()), ...env })
        const timer = setTimeout(() => app.proc.kill('SIGKILL'), 15_000)
        const code = await app.exited
        clearTimeout(timer)
        if (code === 0 || code === null)
          throw new Error(
            `exited ${code}, expected a failure:\n${app.output()}`
          )
        if (!app.output().includes(`needs ${missing}`))
          throw new Error(`no refusal naming ${missing}:\n${app.output()}`)
        if (/pikku: ready/.test(app.output()))
          throw new Error('it started anyway')
      })
    }

    const httpPort = await freePort()
    const app = run({
      PORT: String(httpPort),
      NATS_URL: natsUrl,
      PIKKU_APP_SLUG: 'verifier',
    })
    await until(
      'the app to be ready',
      () => /pikku: ready/.test(app.output()),
      30_000
    )
    const enqueue = (id: string) =>
      fetch(`http://127.0.0.1:${httpPort}/enqueue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })

    await check(
      'the queue and scheduler live in NATS, named after the app slug',
      async () => {
        const jsz = (await (
          await fetch(
            `http://127.0.0.1:${monitorPort}/jsz?streams=true&config=true`
          )
        ).json()) as any
        const stream = (jsz.account_details?.[0]?.stream_detail ?? []).find(
          (s: any) => s.name === 'pikku-verifier'
        )
        if (!stream)
          throw new Error(
            `no pikku-verifier stream: ${JSON.stringify(jsz).slice(0, 400)}`
          )
        if (!stream.config.subjects.includes('pikku.verifier.>'))
          throw new Error(`subjects: ${stream.config.subjects}`)
      }
    )

    await check('a job makes the round trip through NATS', async () => {
      const response = await enqueue('j1')
      if (!response.ok) throw new Error(`enqueue answered ${response.status}`)
      await until('the job to run', () =>
        app.output().includes('NATS_VERIFIER job done j1')
      )
    })

    await check('the cron fires from the NATS scheduler', async () => {
      await until(
        'two cron fires',
        () =>
          (app.output().match(/NATS_VERIFIER cron fired/g) ?? []).length >= 2
      )
    })

    await check(
      'the in-memory workflow service still runs next to the NATS queue, sleep included',
      async () => {
        const response = await fetch(
          `http://127.0.0.1:${httpPort}/start-flow`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'wf' }),
          }
        )
        if (!response.ok)
          throw new Error(`start-flow answered ${response.status}`)
        await until('both workflow steps', () =>
          app.output().includes('NATS_VERIFIER workflow step wf-after-sleep')
        )
      }
    )

    await check(
      'stopping drains the job in flight before the process exits',
      async () => {
        await enqueue('slow')
        await until('the slow job to start', () =>
          app.output().includes('NATS_VERIFIER job started slow')
        )
        app.proc.kill('SIGTERM')
        const code = await app.exited
        if (!app.output().includes('NATS_VERIFIER job done slow'))
          throw new Error(
            `the in-flight job was cut off:\n${app.output().split('\n').slice(-20).join('\n')}`
          )
        if (code !== 0) throw new Error(`exited ${code}`)
      }
    )
  } finally {
    cleanup()
  }
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
