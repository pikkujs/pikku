/**
 * Real-broker proof of what a stage's connection does when the broker's users
 * file changes, of the scheduler's scoped permissions, and of how many users a
 * file can hold. The users sit in an `include`d file and are reloaded with
 * `nats-server --signal reload=<pidfile>`, which is what Studio would do.
 *
 *  - R3: a job survives a reload, with the stage's user unchanged and with its
 *    permissions changed (the server closes that connection; the client must
 *    come back and the job must still be delivered).
 *  - 5.4: removing a user on reload closes its connection.
 *  - 2.P5-4: unschedule / getTask / getAllTasks / pruneAll work in attach mode
 *    under the stage's restricted permissions, on its own stream only.
 *  - S6 inputs: per-stream limits refuse a runaway stage; reload time with N
 *    users in one file (N = SCALE_USERS, default 200) and as N accounts.
 *
 * Needs NATS_SERVER_BIN or nats-server on PATH (2.14+); skips otherwise.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect, headers } from '@nats-io/transport-node'
import {
  DiscardPolicy,
  RetentionPolicy,
  jetstream,
  jetstreamManager,
} from '@nats-io/jetstream'
import {
  freePort,
  prefixOf,
  stagePermissions,
  streamConfig,
  streamOf,
  until,
  type Stage,
} from './broker.js'
import { NatsServiceFactory } from '../../packages/services/queue-nats/src/nats-service-factory.js'
import { natsOptionsFromEnv } from '../../packages/services/queue-nats/src/nats-contributor.js'
import { consumeQueue } from '../../packages/services/queue-nats/src/consume.js'
import { mapPikkuWorkerToNats } from '../../packages/services/queue-nats/src/nats-queue-worker.js'
import {
  SCHEDULE_HEADER,
  SCHEDULE_TARGET_HEADER,
  scheduleSubjectFor,
  subjectForQueue,
} from '../../packages/services/queue-nats/src/utils.js'

const BIN = process.env.NATS_SERVER_BIN ?? 'nats-server'
try {
  execFileSync(BIN, ['--version'], { stdio: 'pipe' })
} catch {
  console.log('Skipping: no nats-server on PATH (set NATS_SERVER_BIN).')
  process.exit(0)
}
const SCALE_USERS = Number(process.env.SCALE_USERS ?? 200)

const admin = { user: 'admin', password: 'admin-pw' }
const stage = (name: string, pw: string): Stage => ({
  project: 'acme',
  stage: name,
  user: `acme-${name}`,
  password: pw,
})
const A = stage('alpha', 'pw-a')
const B = stage('beta', 'pw-b')
const D = stage('doomed', 'pw-d')
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

const userBlock = (s: Stage, extraSubscribe: string[] = []) => {
  const p = stagePermissions(s)
  p.subscribe.allow.push(...extraSubscribe)
  if (extraSubscribe.length) p.publish.allow.push(`${s.project}.noop.>`)
  return `    { user: "${s.user}", password: "${s.password}", permissions: ${JSON.stringify(p)} }`
}
const usersFile = (stages: Stage[], tweak: (s: Stage) => string[] = () => []) =>
  `users = [
    { user: "${admin.user}", password: "${admin.password}", permissions: { publish: ">", subscribe: ">" } }
${stages.map((s) => userBlock(s, tweak(s))).join('\n')}
]
`

const dir = mkdtempSync(join(tmpdir(), 'pikku-nats-reload-'))
const port = await freePort()
const monitorPort = await freePort()
const pidFile = join(dir, 'nats.pid')
const usersPath = join(dir, 'users.conf')
const confPath = join(dir, 'nats.conf')
const logPath = join(dir, 'nats.log')
const writeUsers = (text: string) => {
  writeFileSync(`${usersPath}.tmp`, text, { mode: 0o600 })
  renameSync(`${usersPath}.tmp`, usersPath)
}
writeUsers(usersFile([A, B, D]))
writeFileSync(
  confPath,
  `port: ${port}
http: 127.0.0.1:${monitorPort}
server_name: reload-verifier
jetstream { store_dir: "${join(dir, 'js')}" }
authorization { include './users.conf' }
`
)
const proc: ChildProcess = spawn(
  BIN,
  ['-c', confPath, '-P', pidFile, '-l', logPath],
  { stdio: 'ignore' }
)
process.on('exit', () => {
  proc.kill('SIGKILL')
  rmSync(dir, { recursive: true, force: true })
})
const monitor = `http://127.0.0.1:${monitorPort}`
await until('nats-server', async () => {
  try {
    return (await fetch(`${monitor}/healthz`)).ok
  } catch {
    return false
  }
})
const url = `nats://127.0.0.1:${port}`
const reloadCount = () =>
  (readFileSync(logPath, 'utf8').match(/Reloaded: authorization users/g) ?? [])
    .length
/** Signal a reload and wait for the server to say it finished. Returns ms. */
const reload = async () => {
  const before = reloadCount()
  const t0 = performance.now()
  execFileSync(BIN, ['--signal', `reload=${pidFile}`], { stdio: 'pipe' })
  await until('reload', () => reloadCount() > before, 60_000)
  return performance.now() - t0
}
const conns = async (user: string) => {
  const res = await fetch(`${monitor}/connz?auth=true&state=open&limit=10000`)
  const body = (await res.json()) as {
    connections: { cid: number; authorized_user?: string }[]
  }
  return body.connections.filter((c) => c.authorized_user === user)
}

const adminNc = await connect({
  servers: url,
  user: admin.user,
  pass: admin.password,
})
const adminJsm = await jetstreamManager(adminNc)
for (const s of [A, B, D]) await adminJsm.streams.add(streamConfig(s))

const factoryFor = (s: Stage) =>
  new NatsServiceFactory(
    natsOptionsFromEnv({
      NATS_URL: url,
      NATS_USER: s.user,
      NATS_PASSWORD: s.password,
      PIKKU_PROJECT: s.project,
      PIKKU_STAGE: s.stage,
    })
  )

console.log('A job survives a reload of the users file (attach mode)')
const fa = factoryFor(A)
await fa.init()
const internals = fa as unknown as { js: any; jsm: any }
const done: string[] = []
let inFlight = 0
let lost = 0
const handle = await consumeQueue({
  js: internals.js,
  jsm: internals.jsm,
  streamName: streamOf(A),
  subjectPrefix: prefixOf(A),
  queueName: 'jobs',
  consumerNamePrefix: undefined,
  config: mapPikkuWorkerToNats({ batchSize: 5, lockDuration: 3_000 }),
  onConnectionLost: () => lost++,
  handler: async (msg) => {
    inFlight++
    const id = (msg.json() as { id: string }).id
    await delay(Number((msg.json() as { ms?: number }).ms ?? 0))
    try {
      await msg.ackAck()
    } catch {
      // The ack did not reach the server: it redelivers, which is the
      // at-least-once contract. Do not count this attempt as done.
      inFlight--
      return
    }
    done.push(id)
    inFlight--
  },
} as any)
const queue = fa.getQueueService()

await check(
  'a reload that does not change the stage user leaves its connection and job alone',
  async () => {
    const before = (await conns(A.user)).map((c) => c.cid)
    if (before.length !== 1) throw new Error(`conns ${before.length}`)
    await queue.add('jobs', { id: 'j1', ms: 2_500 })
    await until('job in flight', () => inFlight === 1)
    // Add an unrelated stage user while the job runs.
    const C = stage('gamma', 'pw-c')
    writeUsers(usersFile([A, B, D, C]))
    const ms = await reload()
    await until('job done', () => done.includes('j1'), 15_000)
    const after = (await conns(A.user)).map((c) => c.cid)
    console.log(
      `      reload ${ms.toFixed(0)} ms; A cid before ${before.join()} after ${after.join()}; done ${done.join()}; consumer-lost callbacks ${lost}`
    )
    if (after.join() !== before.join())
      throw new Error(
        `connection replaced: ${before.join()} -> ${after.join()}`
      )
    if (lost) throw new Error('connection reported lost')
  }
)

await check(
  'a reload that changes the stage permissions does not lose a job, whether or not the server replaces the connection',
  async () => {
    const before = (await conns(A.user)).map((c) => c.cid)
    await queue.add('jobs', { id: 'j2', ms: 2_500 })
    await until('job in flight', () => inFlight === 1)
    // A harmless change to A's permissions (one more subscribe subject).
    writeUsers(
      usersFile([A, B, D], (s) =>
        s === A ? [`_INBOX.${A.project}.${A.stage}.extra`] : []
      )
    )
    const ms = await reload()
    // Give a closed connection time to be replaced before looking.
    await delay(5_000)
    const back = (await conns(A.user)).map((c) => c.cid)
    // j2 is delivered at least once: either the first attempt acked before the
    // drop, or the server redelivers it after ack_wait to the same consumer.
    await queue.add('jobs', { id: 'j3', ms: 0 })
    await until(
      'j2 and j3 done',
      () => done.includes('j2') && done.includes('j3'),
      45_000
    )
    const info = await adminJsm.streams.info(streamOf(A))
    console.log(
      `      reload ${ms.toFixed(0)} ms; A cid ${before.join()} -> ${back.join()}; done ${done.join()}; consumer-lost callbacks ${lost}; messages left ${info.state.messages}`
    )
    if (lost) throw new Error('the connection was reported lost for good')
    if (back.length !== 1) throw new Error(`connections after: ${back.length}`)
    if (info.state.messages !== 0) throw new Error('jobs left in the stream')
  }
)

console.log('\nRemoving a user on reload')
await check(
  'dropping a user closes its open connection and it cannot come back',
  async () => {
    const nc = await connect({
      servers: url,
      user: D.user,
      pass: D.password,
      maxReconnectAttempts: 0,
    })
    if ((await conns(D.user)).length !== 1) throw new Error('not connected')
    const closed = nc.closed()
    writeUsers(usersFile([A, B]))
    const ms = await reload()
    const outcome = await Promise.race([
      closed.then((e) => ({ closed: true, error: String(e ?? '') })),
      delay(10_000).then(() => ({ closed: false, error: '' })),
    ])
    const left = (await conns(D.user)).length
    console.log(
      `      reload ${ms.toFixed(0)} ms; client closed=${outcome.closed} ${outcome.error}; server still lists ${left}`
    )
    if (!outcome.closed || left !== 0) throw new Error('connection survived')
    let reconnected = true
    try {
      await (
        await connect({ servers: url, user: D.user, pass: D.password })
      ).close()
    } catch {
      reconnected = false
    }
    if (reconnected) throw new Error('removed user could connect again')
    // The stream and its messages stay until an admin deletes them.
    const info = await adminJsm.streams.info(streamOf(D))
    if (!info.config) throw new Error('stream gone')
  }
)

console.log('\nScheduler API in attach mode, under the stage permissions')
const scheduler = fa.getSchedulerService()
const aJs = internals.js
await check(
  'scheduleRPC, getTask, getAllTasks and unschedule work on the stage stream',
  async () => {
    const id = await scheduler.scheduleRPC(3_600_000, 'someRpc', { n: 1 })
    const task = await scheduler.getTask(id)
    if (task?.rpcName !== 'someRpc') throw new Error('getTask did not find it')
    const all = await scheduler.getAllTasks()
    if (!all.some((t) => t.taskId === id))
      throw new Error('getAllTasks missed it')
    if (!(await scheduler.unschedule(id))) throw new Error('unschedule false')
    if (await scheduler.getTask(id)) throw new Error('still there')
    if (await scheduler.unschedule(id)) throw new Error('second unschedule')
  }
)
await check('pruneAll removes the stage recurring schedules only', async () => {
  const recurring = 'pikku-recurring-scheduled-task'
  for (const [js, s] of [
    [aJs, A],
    [jetstream(adminNc), B],
  ] as const) {
    const h = headers()
    h.set(SCHEDULE_HEADER, '@every 1h')
    h.set(SCHEDULE_TARGET_HEADER, subjectForQueue(prefixOf(s), recurring))
    await js.publish(
      scheduleSubjectFor(prefixOf(s), recurring) + '.nightly',
      JSON.stringify({ rpcName: 'x' }),
      { headers: h }
    )
  }
  const pruned = await scheduler.pruneAll()
  const left = async (s: Stage) =>
    Object.keys(
      (
        await adminJsm.streams.info(streamOf(s), {
          subjects_filter: `${prefixOf(s)}.>`,
        })
      ).state.subjects ?? {}
    ).filter((x) => x.includes('._schedule.'))
  if (pruned !== 1) throw new Error(`pruned ${pruned}`)
  if ((await left(A)).length !== 0) throw new Error('A schedule left')
  if ((await left(B)).length !== 1) throw new Error('B schedule was touched')
})
await check(
  'a task id on another stage is refused before it reaches the broker',
  async () => {
    const foreign = `${scheduleSubjectFor(prefixOf(B), 'pikku-mesh-rpc')}`
    if (await scheduler.unschedule(foreign)) throw new Error('unscheduled')
    if (await scheduler.getTask(foreign)) throw new Error('read')
  }
)

console.log('\nPer-stream limits (S6)')
await check(
  'discard new cannot be combined with message schedules, so a hard refusal is not available per stream',
  async () => {
    const R = stage('runaway', 'pw-r')
    let message = ''
    try {
      await adminJsm.streams.add({
        ...streamConfig(R),
        max_bytes: 2_048,
        discard: DiscardPolicy.New,
      })
    } catch (e) {
      message = (e as Error).message
    }
    console.log(`      server said: ${message || 'nothing (accepted)'}`)
    if (!/schedul/i.test(message)) throw new Error('was accepted')
  }
)
await check(
  'max_bytes with discard old bounds a runaway stage on disk, at the price of dropping its oldest jobs',
  async () => {
    const R = stage('runaway', 'pw-r')
    await adminJsm.streams.add({
      ...streamConfig(R),
      max_bytes: 2_048,
      max_age: 60 * 1e9,
      discard: DiscardPolicy.Old,
    })
    const js = jetstream(adminNc)
    for (let i = 0; i < 40; i++)
      await js.publish(`${prefixOf(R)}.jobs`, `${i}`.padEnd(200, 'x'))
    const info = await adminJsm.streams.info(streamOf(R))
    console.log(
      `      published 40 x ~200 B, stored ${info.state.messages} msgs / ${info.state.bytes} bytes, first seq ${info.state.first_seq}`
    )
    if (info.state.bytes > 2_048) throw new Error('limit not enforced')
    if (info.state.first_seq === 1) throw new Error('nothing was dropped')
    await adminJsm.streams.delete(streamOf(R))
    const names = [] as string[]
    for await (const x of adminJsm.streams.names()) names.push(x)
    if (names.includes(streamOf(R))) throw new Error('stream not deleted')
  }
)

console.log(`\nReload time with ${SCALE_USERS} users`)
const many = (n: number): Stage[] =>
  Array.from({ length: n }, (_, i) => ({
    project: 'proj',
    stage: `s${i}`,
    user: `proj-s${i}`,
    password: `pw-${i}-${'x'.repeat(40)}`,
  }))
await check(`one include file with ${SCALE_USERS} users`, async () => {
  const stages = many(SCALE_USERS)
  const bytes = usersFile([A, B, ...stages]).length
  writeUsers(usersFile([A, B, ...stages]))
  const ms = await reload()
  // 40 of them stay connected through the next reload.
  const live = await Promise.all(
    stages
      .slice(0, 40)
      .map((s) => connect({ servers: url, user: s.user, pass: s.password }))
  )
  const before = (await conns(stages[0]!.user))[0]!.cid
  const last = stages[stages.length - 1]!
  const t0 = performance.now()
  await (
    await connect({ servers: url, user: last.user, pass: last.password })
  ).close()
  const connectMs = performance.now() - t0
  // Add one more user and time until it can log in.
  const extra = {
    project: 'proj',
    stage: 'extra',
    user: 'proj-extra',
    password: 'pw-extra',
  }
  writeUsers(usersFile([A, B, ...stages, extra]))
  const t1 = performance.now()
  const reloadMs = await reload()
  const nc = await connect({
    servers: url,
    user: extra.user,
    pass: extra.password,
  })
  const toLogin = performance.now() - t1
  await nc.close()
  const after = (await conns(stages[0]!.user))[0]?.cid
  console.log(
    `      file ${(bytes / 1024).toFixed(0)} KiB; first load ${ms.toFixed(0)} ms; add-one reload ${reloadMs.toFixed(0)} ms, new user logged in after ${toLogin.toFixed(0)} ms; login ${connectMs.toFixed(0)} ms; unchanged connection kept: ${before === after}`
  )
  await Promise.all(live.map((c) => c.close()))
  if (before !== after) throw new Error('unchanged users were disconnected')
})

/** N accounts, each with JetStream limits and one user, in the same file. */
await check(
  `one account per stage, ${SCALE_USERS} accounts (measured)`,
  async () => {
    const stages = many(SCALE_USERS)
    const accounts = stages
      .map(
        (s) =>
          `  ${s.stage.toUpperCase()}: { jetstream: { max_store: 4MB, max_streams: 4 }, users: [ { user: "${s.user}", password: "${s.password}" } ] }`
      )
      .join('\n')
    const accDir = mkdtempSync(join(tmpdir(), 'pikku-nats-acc-'))
    const accPort = await freePort()
    const accMon = await freePort()
    const accPid = join(accDir, 'nats.pid')
    const accLog = join(accDir, 'nats.log')
    const accUsers = join(accDir, 'accounts.conf')
    writeFileSync(accUsers, `accounts {\n${accounts}\n}\n`)
    writeFileSync(
      join(accDir, 'nats.conf'),
      `port: ${accPort}\nhttp: 127.0.0.1:${accMon}\njetstream { store_dir: "${join(accDir, 'js')}" }\ninclude './accounts.conf'\n`
    )
    const p = spawn(
      BIN,
      ['-c', join(accDir, 'nats.conf'), '-P', accPid, '-l', accLog],
      {
        stdio: 'ignore',
      }
    )
    try {
      await until(
        'accounts server',
        async () => {
          try {
            return (await fetch(`http://127.0.0.1:${accMon}/healthz`)).ok
          } catch {
            return false
          }
        },
        60_000
      )
      const first = stages[0]!
      const nc = await connect({
        servers: `nats://127.0.0.1:${accPort}`,
        user: first.user,
        pass: first.password,
      })
      const jsm = await jetstreamManager(nc)
      await jsm.streams.add({ name: 'q', subjects: ['jobs.>'] })
      const count = () =>
        (readFileSync(accLog, 'utf8').match(/Reloaded/g) ?? []).length
      writeFileSync(
        accUsers,
        `accounts {\n${accounts}\n  EXTRA: { jetstream: { max_store: 4MB, max_streams: 4 }, users: [ { user: "x", password: "y" } ] }\n}\n`
      )
      const before = count()
      const t0 = performance.now()
      execFileSync(BIN, ['--signal', `reload=${accPid}`], { stdio: 'pipe' })
      await until('accounts reload', () => count() > before, 60_000)
      const ms = performance.now() - t0
      const stillThere = await jsm.streams.info('q')
      console.log(
        `      add-one reload ${ms.toFixed(0)} ms; stream of an existing account survived: ${stillThere.state.messages === 0}; open: ${!nc.isClosed()}`
      )
      await nc.close()
    } finally {
      p.kill('SIGKILL')
      rmSync(accDir, { recursive: true, force: true })
    }
  }
)

console.log('\nRevoking the stage user while it runs')
await check(
  'a revoked stage is closed for good; a restarted stage picks the queued job up again',
  async () => {
    const before = (await conns(A.user)).map((c) => c.cid)
    writeUsers(usersFile([B, D]))
    await reload()
    await until(
      'A dropped',
      async () => (await conns(A.user)).length === 0,
      10_000
    )
    await jetstream(adminNc).publish(
      `${prefixOf(A)}.jobs`,
      JSON.stringify({ id: 'j5', ms: 0 })
    )
    // Long enough for the client's reconnect attempts to be refused.
    await delay(4_000)
    writeUsers(usersFile([A, B, D]))
    await reload()
    await delay(6_000)
    const stale = (await conns(A.user)).length
    if (stale !== 0) throw new Error('the old process reconnected by itself')
    const again = factoryFor(A)
    await again.init()
    const internals2 = again as unknown as { js: any; jsm: any }
    const h2 = await consumeQueue({
      js: internals2.js,
      jsm: internals2.jsm,
      streamName: streamOf(A),
      subjectPrefix: prefixOf(A),
      queueName: 'jobs',
      config: mapPikkuWorkerToNats({ batchSize: 5, lockDuration: 3_000 }),
      handler: async (msg) => {
        done.push((msg.json() as { id: string }).id)
        await msg.ackAck()
      },
    } as any)
    await until(
      'j5 done by the restarted stage',
      () => done.includes('j5'),
      20_000
    )
    console.log(
      `      old connection ${before.join()} was not reopened; the restarted stage ran j5`
    )
    await h2.drain(2_000)
    await again.close()
  }
)

await handle.drain(2_000).catch(() => {})
await fa.close().catch(() => {})
await adminNc.close()
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
