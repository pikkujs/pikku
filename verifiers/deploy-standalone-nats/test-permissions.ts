/**
 * Broker-level proof that stages of one project, each with its own JetStream
 * stream and its own restricted user, cannot touch each other. Real
 * nats-server (2.14+); streams and users are created by an admin, the way
 * Studio would (broker.ts).
 *
 * Needs NATS_SERVER_BIN or nats-server on PATH; skips otherwise.
 */
import { execFileSync, spawn } from 'node:child_process'
import { connect, headers, type NatsConnection } from '@nats-io/transport-node'
import { jetstream, jetstreamManager, AckPolicy } from '@nats-io/jetstream'
import {
  prefixOf,
  startBroker,
  streamConfig,
  streamOf,
  until,
  type Stage,
} from './broker.js'

const BIN = process.env.NATS_SERVER_BIN ?? 'nats-server'
try {
  execFileSync(BIN, ['--version'], { stdio: 'pipe' })
} catch {
  console.log('Skipping: no nats-server on PATH (set NATS_SERVER_BIN).')
  process.exit(0)
}

const admin = { user: 'admin', password: 'admin-pw' }
const stage = (name: string, pw: string): Stage => ({
  project: 'acme',
  stage: name,
  user: `acme-${name}`,
  password: pw,
})
const A = stage('alpha', 'pw-a')
const B = stage('beta', 'pw-b')

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
const denied = async (what: string, op: () => Promise<unknown>) => {
  try {
    await op()
  } catch {
    return
  }
  throw new Error(`${what} was allowed`)
}

const broker = await startBroker(BIN, admin, [A, B])
process.on('exit', () => broker.stop())
const adminNc = await connect({
  servers: broker.url,
  user: admin.user,
  pass: admin.password,
})
const adminJsm = await jetstreamManager(adminNc)
const adminJs = jetstream(adminNc)
await adminJsm.streams.add(streamConfig(A))
await adminJsm.streams.add(streamConfig(B))
await adminJsm.streams.add({ name: 'OTHER', subjects: ['other.>'] })

const connections: NatsConnection[] = []
const login = async (s: Stage) => {
  const nc = await connect({
    servers: broker.url,
    user: s.user,
    pass: s.password,
    inboxPrefix: `_INBOX.${s.project}.${s.stage}`,
  })
  connections.push(nc)
  return {
    nc,
    js: jetstream(nc, { timeout: 1_500 }),
    jsm: await jetstreamManager(nc, { checkAPI: false, timeout: 1_500 }),
    violations: 0,
  }
}
const a = await login(A)
const b = await login(B)
void (async () => {
  for await (const status of a.nc.status()) {
    if (
      status.type === 'error' &&
      /Permissions Violation/i.test(String(status.error))
    )
      a.violations++
  }
})()

const consumerConfig = (s: Stage, name = 'jobs') => ({
  durable_name: `${s.project}_${s.stage}_${name}`,
  filter_subject: `${prefixOf(s)}.${name}`,
  ack_policy: AckPolicy.Explicit,
})
const jobsFor = (s: Stage) => `${prefixOf(s)}.jobs`

console.log('Each stage runs with only its own permissions')
await check(
  'a stage binds its own consumers, publishes and receives its own job',
  async () => {
    for (const [s, c] of [
      [A, a],
      [B, b],
    ] as const) {
      // Any consumer name works: the list does not name queues.
      for (const queue of ['jobs', 'wf-orchestrator-anything'])
        await c.jsm.consumers.add(streamOf(s), consumerConfig(s, queue))
      await c.js.publish(jobsFor(s), JSON.stringify({ for: s.stage }))
    }
    for (const [s, c] of [
      [A, a],
      [B, b],
    ] as const) {
      const consumer = await c.js.consumers.get(
        streamOf(s),
        consumerConfig(s).durable_name
      )
      const batch = await consumer.fetch({ max_messages: 5, expires: 1_500 })
      const got: string[] = []
      for await (const m of batch) {
        got.push((m.json() as any).for)
        m.ack()
      }
      if (got.join() !== s.stage)
        throw new Error(`${s.stage} received ${got.join() || 'nothing'}`)
    }
  }
)
await check(
  'it can read, list the schedules of and purge its own stream',
  async () => {
    const info = await a.jsm.streams.info(streamOf(A))
    if (!info.config.allow_msg_schedules) throw new Error('schedules off')
    await a.js.publish(`${prefixOf(A)}.scratch`, '1')
    const purged = await a.jsm.streams.purge(streamOf(A), {
      filter: `${prefixOf(A)}.scratch`,
    })
    if (purged.purged !== 1) throw new Error(`purged ${purged.purged}`)
    await a.js.publish(`${prefixOf(A)}.scratch`, '1')
    const msg = await a.jsm.streams.getMessage(streamOf(A), {
      last_by_subj: `${prefixOf(A)}.scratch`,
    })
    if (!msg) throw new Error('no message')
    await a.jsm.streams.purge(streamOf(A), { filter: `${prefixOf(A)}.scratch` })
  }
)

console.log("\nStage A cannot reach stage B or B's stream")
await check('publish to B subjects is refused and nothing lands', async () => {
  await denied('publish to B', () => a.js.publish(jobsFor(B), '{"evil":1}'))
  const info = await adminJsm.streams.info(streamOf(B), {
    subjects_filter: `${prefixOf(B)}.>`,
  })
  if (info.state.messages !== 0) throw new Error('a message landed')
})
await check(
  'subscribing to B subjects, or to everything, receives nothing',
  async () => {
    let got = 0
    for (const subject of [`${prefixOf(B)}.>`, '>']) {
      const sub = a.nc.subscribe(subject)
      void (async () => {
        try {
          for await (const _ of sub) got++
        } catch {}
      })()
    }
    adminNc.publish(jobsFor(B), '{"x":1}')
    adminNc.publish('other.thing', '1')
    await new Promise((r) => setTimeout(r, 800))
    if (got > 0) throw new Error(`received ${got} messages`)
  }
)
await check(
  "it cannot read B's stream: no subjects, counts or messages leak",
  async () => {
    await denied('stream info', () => a.jsm.streams.info(streamOf(B)))
    await denied('stream info with subjects', () =>
      a.jsm.streams.info(streamOf(B), { subjects_filter: '>' })
    )
    await denied('get message', () =>
      a.jsm.streams.getMessage(streamOf(B), { seq: 1 })
    )
    await denied('purge', () => a.jsm.streams.purge(streamOf(B)))
  }
)
await check("it cannot touch B's consumers", async () => {
  await denied('info', () =>
    a.jsm.consumers.info(streamOf(B), consumerConfig(B).durable_name)
  )
  await denied('create', () =>
    a.jsm.consumers.add(streamOf(B), consumerConfig(B, 'mine'))
  )
  await denied('delete', () =>
    a.jsm.consumers.delete(streamOf(B), consumerConfig(B).durable_name)
  )
  await denied('pull', async () => {
    const consumer = await a.js.consumers.get(
      streamOf(B),
      consumerConfig(B).durable_name
    )
    await consumer.fetch({ max_messages: 1, expires: 1_000 })
  })
})
await check(
  "a consumer of A's stream filtered onto B subjects can never see B's jobs",
  async () => {
    // The stream holds only A's subjects, so the filter matches nothing.
    await a.jsm.consumers.add(streamOf(A), {
      ...consumerConfig(A, 'x'),
      filter_subject: jobsFor(B),
    })
    await adminJs.publish(jobsFor(B), '{"b":1}')
    const consumer = await a.js.consumers.get(
      streamOf(A),
      consumerConfig(A, 'x').durable_name
    )
    let got = 0
    for await (const m of await consumer.fetch({
      max_messages: 5,
      expires: 1_000,
    })) {
      got++
      m.ack()
    }
    if (got > 0) throw new Error(`received ${got}`)
  }
)

console.log('\nStage A cannot touch the streams themselves')
await check(
  'cannot create, update or delete a stream, its own included',
  async () => {
    await denied('create', () =>
      a.jsm.streams.add({ name: 'MINE', subjects: ['mine.>'] })
    )
    await denied('create own name', () => a.jsm.streams.add(streamConfig(A)))
    await denied('update', () =>
      a.jsm.streams.update(streamOf(A), { subjects: ['pikku.>'] } as any)
    )
    await denied('delete', () => a.jsm.streams.delete(streamOf(A)))
  }
)
await check('cannot read other streams or list streams', async () => {
  await denied('info OTHER', () => a.jsm.streams.info('OTHER'))
  await denied('list', async () => {
    for await (const _ of a.jsm.streams.list()) break
  })
  await denied('publish other', () => a.js.publish('other.x', '1'))
})
await check(
  'the refusals are permission violations, and an admin can do each of them',
  async () => {
    if (a.violations < 10)
      throw new Error(
        `only ${a.violations} permission violations were reported`
      )
    await adminJsm.consumers.info(streamOf(B), consumerConfig(B).durable_name)
    await adminJsm.streams.info('OTHER')
    await adminJsm.streams.getMessage(streamOf(A), { seq: 1 }).catch(() => {})
    await adminJsm.streams.add({ name: 'MINE', subjects: ['mine.>'] })
    await adminJsm.streams.delete('MINE')
    await adminJsm.consumers.delete(
      streamOf(B),
      consumerConfig(B, 'jobs').durable_name
    )
    await adminJsm.consumers.add(streamOf(B), consumerConfig(B))
  }
)

console.log('\nCredentials')
for (const [label, opts] of [
  ['a wrong password', { user: A.user, pass: 'nope' }],
  ['no credentials', {}],
  ["B's password as A", { user: A.user, pass: B.password }],
] as const)
  await check(`${label} does not connect`, () =>
    denied('connect', () =>
      connect({
        servers: broker.url,
        reconnect: false,
        timeout: 2_000,
        ...opts,
      })
    )
  )

console.log('\nScheduled messages')
await check(
  'scheduled messages work under the restricted permissions',
  async () => {
    const hdrs = headers()
    hdrs.set('Nats-Schedule', '@every 1s')
    hdrs.set('Nats-Schedule-Target', `${prefixOf(A)}.cron-target`)
    await a.js.publish(`${prefixOf(A)}._schedule.tick`, '{"tick":1}', {
      headers: hdrs,
    })
    await until('a scheduled fire', async () => {
      const info = await adminJsm.streams.info(streamOf(A), {
        subjects_filter: `${prefixOf(A)}.cron-target`,
      })
      return (info.state.subjects?.[`${prefixOf(A)}.cron-target`] ?? 0) >= 1
    })
  }
)
await check(
  "a schedule cannot name another stage's subject as its target",
  async () => {
    const bBefore = (await adminJsm.streams.info(streamOf(B))).state.messages
    const hdrs = headers()
    hdrs.set('Nats-Schedule', '@at 2020-01-01T00:00:00Z')
    hdrs.set('Nats-Schedule-Target', jobsFor(B))
    let accepted = true
    let reason = ''
    try {
      await a.js.publish(`${prefixOf(A)}._schedule.smuggle`, '{"smuggled":1}', {
        headers: hdrs,
      })
    } catch (e) {
      accepted = false
      reason = (e as Error).message
    }
    await new Promise((r) => setTimeout(r, 1_500))
    const info = await adminJsm.streams.info(streamOf(B))
    if (info.state.messages !== bBefore)
      throw new Error(
        `${info.state.messages} messages on B (accepted=${accepted})`
      )
    const own = await adminJsm.streams.info(streamOf(A), {
      subjects_filter: `${prefixOf(A)}._schedule.smuggle`,
    })
    console.log(
      `      publish ${accepted ? 'accepted' : `refused (${reason})`}; schedule stored=${
        (own.state.subjects?.[`${prefixOf(A)}._schedule.smuggle`] ?? 0) > 0
      }; nothing produced on B`
    )
  }
)

console.log('\nAdding and removing a stage without restarting the broker')
await check(
  'a new stage (stream + user, reload) runs while the others keep running',
  async () => {
    const C = stage('gamma', 'pw-c')
    await denied('connect before', () =>
      connect({
        servers: broker.url,
        user: C.user,
        pass: C.password,
        reconnect: false,
        timeout: 1_500,
      })
    )
    broker.rewrite([A, B, C])
    broker.reload()
    await adminJsm.streams.add(streamConfig(C))
    let c: Awaited<ReturnType<typeof login>> | undefined
    await until('the new user to log in', async () => {
      try {
        c = await login(C)
        return true
      } catch {
        return false
      }
    })
    await c!.jsm.consumers.add(streamOf(C), consumerConfig(C))
    await c!.js.publish(jobsFor(C), '{"c":1}')
    const before = connections.length
    // Remove: drop the user, reload, delete the stream.
    broker.rewrite([A, B])
    broker.reload()
    await until(
      'the removed user to be dropped',
      () => c!.nc.isClosed(),
      10_000
    )
    await denied('connect after', () =>
      connect({
        servers: broker.url,
        user: C.user,
        pass: C.password,
        reconnect: false,
        timeout: 1_500,
      })
    )
    const left = await adminJsm.streams.info(streamOf(C))
    console.log(
      `      after removing the user: stream still holds ${left.state.messages} message(s), ${left.state.consumer_count} consumer(s)`
    )
    await adminJsm.streams.delete(streamOf(C))
    await denied('stream gone', () => adminJsm.streams.info(streamOf(C)))
    if (a.nc.isClosed() || b.nc.isClosed() || before < 3)
      throw new Error('an unrelated stage was disconnected')
    await a.js.publish(jobsFor(A), '{"still":"running"}')
  }
)

console.log('\nMany streams')
await check('50 more streams: idle memory and restart time', async () => {
  const rss = (pid: number) =>
    Number(
      execFileSync('ps', ['-o', 'rss=', '-p', String(pid)])
        .toString()
        .trim()
    ) / 1024
  const base = rss(broker.proc.pid!)
  for (let i = 0; i < 50; i++) {
    const s = stage(`bulk${i}`, 'pw')
    await adminJsm.streams.add(streamConfig(s))
    await adminJsm.consumers.add(streamOf(s), consumerConfig(s))
  }
  await new Promise((r) => setTimeout(r, 2_000))
  const loaded = rss(broker.proc.pid!)
  let streams = 0
  for await (const _ of adminJsm.streams.list()) streams++
  // Restart on the same store, as a deploy of the broker would.
  await adminNc.close()
  for (const nc of connections) await nc.close().catch(() => {})
  broker.proc.kill('SIGTERM')
  await new Promise((r) => broker.proc.once('exit', r))
  const started = Date.now()
  const proc = spawn(BIN, ['-c', broker.confPath], { stdio: 'ignore' })
  await until('the broker to restart', async () => {
    try {
      return (await fetch(`http://127.0.0.1:${broker.monitorPort}/healthz`)).ok
    } catch {
      return false
    }
  })
  const restart = Date.now() - started
  const after = rss(proc.pid!)
  proc.kill('SIGKILL')
  console.log(
    `      ${streams} streams: idle RSS ${base.toFixed(0)} MB -> ${loaded.toFixed(0)} MB (after restart ${after.toFixed(0)} MB), ready again in ${restart} ms`
  )
})

broker.stop()
if (failures > 0) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
