/**
 * Verifier for the NATS contributor in a standalone deploy, two stages of one
 * project sharing one broker.
 *
 * Build side: `pikku deploy plan --provider standalone` selects the `nats`
 * contributor of @pikku/queue-nats (opted in with wireContributors); the same
 * source planned for Cloudflare, which is how the cloud builds it, does not.
 * Run side: against a real nats-server (2.14+, JetStream) with a shared stream
 * created up front and one restricted user per stage (broker.ts), two copies of
 * the bundle each get only their own jobs and crons, a restart keeps a stage's
 * schedules and queued jobs, and every missing credential refuses to start.
 *
 * The server comes from NATS_SERVER_BIN or PATH. Without one, or without bun,
 * the run-side checks are skipped and the build checks still run.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { connect, headers } from '@nats-io/transport-node'
import {
  jetstream,
  jetstreamManager,
  RetentionPolicy,
} from '@nats-io/jetstream'
import {
  STREAM,
  appQueues,
  freePort,
  prefixOf,
  startBroker,
  until,
  type Stage,
} from './broker.js'

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
  !!natsVersion &&
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
const pikku = (...args: string[]) =>
  execFileSync('node', [PIKKU_BIN, ...args], {
    cwd: HERE,
    stdio: 'pipe',
    timeout: 300_000,
  })

console.log(
  'Setting up: pikku all + deploy plan (standalone, then cloudflare)...'
)
rmSync(join(HERE, '.deploy'), { recursive: true, force: true })
rmSync(join(HERE, '.pikku'), { recursive: true, force: true })
pikku('all')
pikku(
  'deploy',
  'plan',
  '--provider',
  'standalone',
  '--result-file',
  '.deploy/standalone/plan-result.json'
)
pikku(
  'deploy',
  'plan',
  '--provider',
  'cloudflare',
  '--result-file',
  '.deploy/cloudflare/plan-result.json'
)

console.log('\nBuild: which target gets the contributor')
await check(
  'standalone selects nats, and the platform knows it is standalone',
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
    if (!generated.includes('"provider":"standalone"'))
      throw new Error('the platform did not name the provider')
  }
)
await check(
  'the same source built for Cloudflare (the cloud build) does not select nats',
  () => {
    const dir = join(HERE, '.deploy', 'cloudflare', 'units')
    const units = readdirSync(dir)
    if (units.length === 0) throw new Error('no cloudflare units were built')
    for (const unit of units) {
      const generated = join(dir, unit, 'platform-services.gen.ts')
      if (
        existsSync(generated) &&
        readFileSync(generated, 'utf-8').includes('natsDeploy')
      )
        throw new Error(`${unit} selected nats`)
      const bundle = readFileSync(join(dir, unit, 'bundle.js'), 'utf-8')
      for (const marker of ['NATS_URL', 'NATS_PASSWORD', 'PIKKU_PROJECT'])
        if (bundle.includes(marker))
          throw new Error(`${unit} bundle mentions ${marker}`)
    }
  }
)

if (!natsOk || !bunOk) {
  console.log(
    `\nSkipping run checks: ${!bunOk ? 'bun not on PATH' : 'no nats-server >= 2.14 (set NATS_SERVER_BIN)'}.`
  )
} else {
  const project = 'acme'
  const admin = { user: 'admin', password: 'admin-pw' }
  const queues = appQueues(HERE)
  const A: Stage = {
    project,
    stage: 'alpha',
    user: 'acme-alpha',
    password: 'pw-a',
    queues,
  }
  const B: Stage = {
    project,
    stage: 'beta',
    user: 'acme-beta',
    password: 'pw-b',
    queues,
  }
  const broker = await startBroker(NATS_BIN, admin, [A, B])
  const procs: ChildProcess[] = []
  process.on('exit', () => {
    for (const proc of procs) proc.kill('SIGKILL')
    broker.stop()
  })
  const adminNc = await connect({
    servers: broker.url,
    user: admin.user,
    pass: admin.password,
  })
  const adminJsm = await jetstreamManager(adminNc)
  const adminJs = jetstream(adminNc)
  // The stream is created up front, by the broker's operator, never by an app.
  await adminJsm.streams.add({
    name: STREAM,
    subjects: ['pikku.>'],
    retention: RetentionPolicy.Workqueue,
    allow_msg_schedules: true,
  })

  type App = ReturnType<typeof run>
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
  const envFor = async (s: Stage, port?: number) => ({
    PORT: String(port ?? (await freePort())),
    NATS_URL: broker.url,
    NATS_USER: s.user,
    NATS_PASSWORD: s.password,
    PIKKU_PROJECT: s.project,
    PIKKU_STAGE: s.stage,
  })
  const ready = (app: App) =>
    until(
      'the app to be ready',
      () => /pikku: ready/.test(app.output()),
      30_000
    )
  const count = (app: App, needle: RegExp) =>
    (app.output().match(needle) ?? []).length
  const enqueue = (port: number, id: string) =>
    fetch(`http://127.0.0.1:${port}/enqueue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  const scheduleSubjects = async (s: Stage) => {
    const info = await adminJsm.streams.info(STREAM, {
      subjects_filter: `${prefixOf(s)}._schedule.>`,
    })
    return Object.keys(info.state.subjects ?? {}).sort()
  }
  const scheduleSeq = async (s: Stage, subject: string) =>
    (await adminJsm.streams.getMessage(STREAM, { last_by_subj: subject })).seq

  try {
    console.log('\nRun: refuses to start without what it needs')
    const everything = await envFor(A)
    const wrongPassword = { ...everything, NATS_PASSWORD: 'wrong' }
    const cases: Array<[string, Record<string, string>, string]> = [
      [
        'NATS_URL',
        Object.fromEntries(
          Object.entries(everything).filter(([k]) => k !== 'NATS_URL')
        ),
        'needs NATS_URL',
      ],
      [
        'NATS_USER',
        Object.fromEntries(
          Object.entries(everything).filter(([k]) => k !== 'NATS_USER')
        ),
        'needs NATS_USER',
      ],
      [
        'NATS_PASSWORD',
        Object.fromEntries(
          Object.entries(everything).filter(([k]) => k !== 'NATS_PASSWORD')
        ),
        'needs NATS_PASSWORD',
      ],
      [
        'PIKKU_PROJECT',
        Object.fromEntries(
          Object.entries(everything).filter(([k]) => k !== 'PIKKU_PROJECT')
        ),
        'needs PIKKU_PROJECT',
      ],
      [
        'PIKKU_STAGE',
        Object.fromEntries(
          Object.entries(everything).filter(([k]) => k !== 'PIKKU_STAGE')
        ),
        'needs PIKKU_STAGE',
      ],
      [
        'a stage with a dot',
        { ...everything, PIKKU_STAGE: 'a.b' },
        'is not usable in a NATS subject',
      ],
      [
        'a wildcard stage',
        { ...everything, PIKKU_STAGE: '>' },
        'is not usable in a NATS subject',
      ],
      ['a wrong password', wrongPassword, ''],
    ]
    for (const [label, env, message] of cases) {
      await check(`refuses to start: ${label}`, async () => {
        const app = run(env)
        const timer = setTimeout(() => app.proc.kill('SIGKILL'), 20_000)
        const code = await app.exited
        clearTimeout(timer)
        if (code === 0 || code === null)
          throw new Error(
            `exited ${code}, expected a failure:\n${app.output()}`
          )
        if (message && !app.output().includes(message))
          throw new Error(`no refusal saying "${message}":\n${app.output()}`)
        if (/pikku: ready/.test(app.output()))
          throw new Error('it started anyway')
      })
    }
    await check(
      'refuses to start when the shared stream does not exist',
      async () => {
        await adminJsm.streams.delete(STREAM)
        const app = run(await envFor(A))
        const code = await app.exited
        if (code === 0) throw new Error('it started')
        if (!/stream 'PIKKU' is not available/.test(app.output()))
          throw new Error(app.output().slice(-600))
        await adminJsm.streams.add({
          name: STREAM,
          subjects: ['pikku.>'],
          retention: RetentionPolicy.Workqueue,
          allow_msg_schedules: true,
        })
      }
    )

    console.log('\nRun: two stages on one broker')
    const portA = await freePort()
    const portB = await freePort()
    let appA = run(await envFor(A, portA))
    const appB = run(await envFor(B, portB))
    await ready(appA)
    await ready(appB)

    await check(
      'the broker holds one stream; each stage has its own consumers and schedule',
      async () => {
        const names = (
          await adminJsm.streams.info(STREAM, { deleted_details: false })
        ).config.name
        if (names !== STREAM) throw new Error(names)
        const consumers: string[] = []
        for await (const c of adminJsm.consumers.list(STREAM))
          consumers.push(c.name)
        for (const s of [A, B])
          if (!consumers.includes(`${s.project}_${s.stage}_jobs`))
            throw new Error(`no consumer for ${s.stage}: ${consumers}`)
        if (consumers.some((c) => !/^acme_(alpha|beta)_/.test(c)))
          throw new Error(`stray consumer: ${consumers}`)
        for (const s of [A, B]) {
          const subjects = await scheduleSubjects(s)
          if (
            subjects.length !== 1 ||
            !subjects[0]!.startsWith(`${prefixOf(s)}._schedule.`)
          )
            throw new Error(`${s.stage} schedules: ${subjects}`)
        }
      }
    )
    await check('each stage gets only its own jobs', async () => {
      await enqueue(portA, 'a1')
      await enqueue(portB, 'b1')
      await until(
        'both jobs',
        () =>
          appA.output().includes('job done a1') &&
          appB.output().includes('job done b1')
      )
      await new Promise((r) => setTimeout(r, 500))
      if (appA.output().includes('b1') || appB.output().includes('a1'))
        throw new Error('a job crossed stages')
    })
    await check('each stage gets only its own cron fires', async () => {
      await until(
        'cron on both',
        () =>
          count(appA, /cron fired stage=alpha/g) >= 2 &&
          count(appB, /cron fired stage=beta/g) >= 2
      )
      if (/stage=beta/.test(appA.output()) || /stage=alpha/.test(appB.output()))
        throw new Error('a cron crossed stages')
    })
    await check(
      'the in-memory workflow service still runs next to the NATS queue, sleep included',
      async () => {
        const response = await fetch(`http://127.0.0.1:${portA}/start-flow`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 'wf' }),
        })
        if (!response.ok)
          throw new Error(`start-flow answered ${response.status}`)
        await until('both workflow steps', () =>
          appA.output().includes('workflow step wf-after-sleep')
        ).catch((e) => {
          throw new Error(
            `${e.message}\n${appA
              .output()
              .split('\n')
              .filter(
                (l) => !/cron fired|Running sched|scheduled task: tick/.test(l)
              )
              .slice(-25)
              .join('\n')}`
          )
        })
      }
    )

    console.log('\nRun: restart one stage')
    const betaSubject = (await scheduleSubjects(B))[0]!
    const betaSeqBefore = await scheduleSeq(B, betaSubject)
    const alphaBefore = await scheduleSubjects(A)
    // A schedule for a task this code no longer has, left by an earlier release.
    // The stage user cannot purge, so the contributor retires it another way.
    const alphaNc = await connect({
      servers: broker.url,
      user: A.user,
      pass: A.password,
      inboxPrefix: `_INBOX.${A.project}.${A.stage}`,
    })
    const ghost = `${prefixOf(A)}._schedule.pikku-recurring-scheduled-task.ghost`
    const hdrs = headers()
    hdrs.set('Nats-Schedule', '@every 1h')
    hdrs.set(
      'Nats-Schedule-Target',
      `${prefixOf(A)}.pikku-recurring-scheduled-task`
    )
    await jetstream(alphaNc).publish(ghost, '{"rpcName":"ghost"}', {
      headers: hdrs,
    })
    await alphaNc.close()
    appA.proc.kill('SIGTERM')
    await appA.exited
    await adminJs.publish(
      `${prefixOf(A)}.jobs`,
      JSON.stringify({ id: 'while-down' })
    )
    appA = run(await envFor(A, portA))
    await ready(appA)

    await check(
      'a job queued while the stage was down runs when it is back',
      () =>
        until('the queued job', () =>
          appA.output().includes('job done while-down')
        )
    )
    await check(
      'the restarted stage keeps its schedules and a removed task is retired without a purge',
      async () => {
        await until(
          'the orphan to go',
          async () => !(await scheduleSubjects(A)).includes(ghost)
        )
        const after = await scheduleSubjects(A)
        if (after.join() !== alphaBefore.join())
          throw new Error(`before ${alphaBefore}, after ${after}`)
        await until(
          'cron after restart',
          () => count(appA, /cron fired stage=alpha/g) >= 2
        )
        if (/ghost/.test(appA.output().replace(/Pruned orphaned[^\n]*/g, '')))
          throw new Error('the ghost task ran')
      }
    )
    await check(
      "the other stage's schedule was not touched and kept firing",
      async () => {
        if ((await scheduleSeq(B, betaSubject)) !== betaSeqBefore)
          throw new Error('beta schedule was rewritten')
        const before = count(appB, /cron fired stage=beta/g)
        await until(
          'beta cron',
          () => count(appB, /cron fired stage=beta/g) > before
        )
      }
    )

    console.log('\nRun: stop drains')
    await check(
      'stopping drains the job in flight before the process exits',
      async () => {
        await enqueue(portA, 'slow')
        await until('the slow job to start', () =>
          appA.output().includes('job started slow')
        )
        appA.proc.kill('SIGTERM')
        const code = await appA.exited
        if (!appA.output().includes('job done slow'))
          throw new Error(
            `the in-flight job was cut off:\n${appA.output().split('\n').slice(-20).join('\n')}`
          )
        if (code !== 0) throw new Error(`exited ${code}`)
      }
    )
  } finally {
    await adminNc.close().catch(() => {})
    for (const proc of procs) proc.kill('SIGKILL')
    broker.stop()
  }
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
