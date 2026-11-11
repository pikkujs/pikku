/**
 * Broker-level proof that two stages of one project can share one JetStream
 * stream and still not touch each other. Real nats-server (2.14+), with the
 * stream created by an admin and one restricted user per stage (broker.ts).
 *
 * Needs NATS_SERVER_BIN or nats-server on PATH; skips otherwise.
 */
import { execFileSync } from 'node:child_process'
import { connect, headers, type NatsConnection } from '@nats-io/transport-node'
import {
  jetstream,
  jetstreamManager,
  AckPolicy,
  RetentionPolicy,
} from '@nats-io/jetstream'
import {
  STREAM,
  consumerName,
  prefixOf,
  startBroker,
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
const A: Stage = {
  project: 'acme',
  stage: 'alpha',
  user: 'acme-alpha',
  password: 'pw-a',
}
const B: Stage = {
  project: 'acme',
  stage: 'beta',
  user: 'acme-beta',
  password: 'pw-b',
}
const queues = ['jobs']
A.queues = queues
B.queues = queues

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
const as = (s: Stage | typeof admin, extra: object = {}) =>
  connect({
    servers: broker.url,
    user: s.user,
    pass: 'password' in s ? s.password : '',
    inboxPrefix: 'project' in s ? `_INBOX.${s.project}.${s.stage}` : undefined,
    ...extra,
  })
const managerOf = (nc: NatsConnection) =>
  jetstreamManager(nc, { checkAPI: false, timeout: 1_500 })

const adminNc = await as({ user: 'admin', password: 'admin-pw' } as any)
const adminJsm = await jetstreamManager(adminNc)
await adminJsm.streams.add({
  name: STREAM,
  subjects: ['pikku.>'],
  retention: RetentionPolicy.Workqueue,
  allow_msg_schedules: true,
})
await adminJsm.streams.add({ name: 'OTHER', subjects: ['other.>'] })

const connections: NatsConnection[] = []
const login = async (s: Stage) => {
  const nc = await as(s)
  connections.push(nc)
  return { nc, js: jetstream(nc, { timeout: 1_500 }), jsm: await managerOf(nc) }
}
const a = await login(A)
let violations = 0
void (async () => {
  for await (const status of a.nc.status()) {
    if (
      status.type === 'error' &&
      /Permissions Violation/i.test(String(status.error))
    )
      violations++
  }
})()
const b = await login(B)

const consumerConfig = (s: Stage) => ({
  durable_name: consumerName(s, 'jobs'),
  filter_subject: `${prefixOf(s)}.jobs`,
  ack_policy: AckPolicy.Explicit,
})

console.log('Each stage runs with only its own permissions')
await check(
  'a stage binds its own consumer, publishes and receives its own job',
  async () => {
    for (const [s, c] of [
      [A, a],
      [B, b],
    ] as const) {
      await c.jsm.consumers.add(STREAM, consumerConfig(s))
      await c.js.publish(
        `${prefixOf(s)}.jobs`,
        JSON.stringify({ for: s.stage })
      )
    }
    for (const [s, c] of [
      [A, a],
      [B, b],
    ] as const) {
      const consumer = await c.js.consumers.get(STREAM, consumerName(s, 'jobs'))
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
await check('the boot check can read the shared stream', async () => {
  const info = await a.jsm.streams.info(STREAM)
  if (!info.config.allow_msg_schedules) throw new Error('schedules off')
})

console.log('\nStage A cannot reach stage B')
await check('publish to B subjects is refused and nothing lands', async () => {
  await denied('publish to B', () =>
    a.js.publish(`${prefixOf(B)}.jobs`, '{"evil":1}')
  )
  const info = await adminJsm.streams.info(STREAM, {
    subjects_filter: `${prefixOf(B)}.>`,
  })
  if (Object.keys(info.state.subjects ?? {}).length > 0)
    throw new Error('a message landed')
})
await check('subscribe to B subjects is refused', async () => {
  const sub = a.nc.subscribe(`${prefixOf(B)}.>`)
  let got = 0
  void (async () => {
    try {
      for await (const _ of sub) got++
    } catch {}
  })()
  adminNc.publish(`${prefixOf(B)}.jobs`, '{"x":1}')
  await new Promise((r) => setTimeout(r, 800))
  if (got > 0) throw new Error('A received B traffic')
  // The server also tells the client why.
  await a.nc.flush().catch(() => {})
})
await check('subscribing to everything is refused', async () => {
  const sub = a.nc.subscribe('>')
  let got = 0
  void (async () => {
    try {
      for await (const _ of sub) got++
    } catch {}
  })()
  adminNc.publish('other.thing', '1')
  adminNc.publish(`${prefixOf(B)}.jobs`, '1')
  await new Promise((r) => setTimeout(r, 800))
  if (got > 0) throw new Error(`received ${got} messages`)
})
await check("cannot read B's consumer", () =>
  denied('consumer info', () =>
    a.jsm.consumers.info(STREAM, consumerName(B, 'jobs'))
  )
)
await check("cannot pull from B's consumer", async () => {
  await b.js.publish(`${prefixOf(B)}.jobs`, '{"secret":1}')
  await denied('pull', async () => {
    const consumer = await a.js.consumers.get(STREAM, consumerName(B, 'jobs'))
    await consumer.fetch({ max_messages: 1, expires: 1_000 })
  })
})
await check("cannot create or take over B's consumer name", async () => {
  await denied('create B name on A subjects', () =>
    a.jsm.consumers.add(STREAM, {
      ...consumerConfig(B),
      filter_subject: `${prefixOf(A)}.jobs`,
    })
  )
  await denied('create B name on B subjects', () =>
    a.jsm.consumers.add(STREAM, consumerConfig(B))
  )
})
await check("cannot delete B's consumer", async () => {
  await denied('delete', () =>
    a.jsm.consumers.delete(STREAM, consumerName(B, 'jobs'))
  )
  const info = await adminJsm.consumers.info(STREAM, consumerName(B, 'jobs'))
  if (!info) throw new Error('consumer vanished')
})
await check('cannot create a consumer under a name it was not given', () =>
  denied('create', () =>
    a.jsm.consumers.add(STREAM, {
      ...consumerConfig(A),
      durable_name: 'evil',
      filter_subject: `${prefixOf(A)}.jobs`,
    })
  )
)
await check('cannot filter its own consumer onto B subjects', () =>
  denied('create', () =>
    a.jsm.consumers.add(STREAM, {
      ...consumerConfig(A),
      filter_subject: `${prefixOf(B)}.jobs`,
    })
  )
)

console.log('\nStage A cannot touch the stream or other streams')
await check('cannot create, update or delete the stream', async () => {
  await denied('create', () =>
    a.jsm.streams.add({ name: 'MINE', subjects: ['mine.>'] })
  )
  await denied('update', () =>
    a.jsm.streams.update(STREAM, { subjects: ['pikku.>', 'x.>'] } as any)
  )
  await denied('delete', () => a.jsm.streams.delete(STREAM))
})
await check('cannot purge the stream, whole or filtered to B', async () => {
  await denied('purge all', () => a.jsm.streams.purge(STREAM))
  await denied('purge B', () =>
    a.jsm.streams.purge(STREAM, { filter: `${prefixOf(B)}.>` })
  )
  const info = await adminJsm.streams.info(STREAM)
  if (info.state.messages === 0) throw new Error('stream was emptied')
})
await check(
  'cannot read other streams, list streams, or read stored messages',
  async () => {
    await denied('info OTHER', () => a.jsm.streams.info('OTHER'))
    await denied('list', async () => {
      for await (const _ of a.jsm.streams.list()) break
    })
    await denied('get message', () =>
      a.jsm.streams.getMessage(STREAM, { seq: 1 })
    )
  }
)
await check(
  'cannot publish to another stream or to the API of an unlisted subject',
  async () => {
    await denied('publish other', () => a.js.publish('other.x', '1'))
  }
)

await check(
  'the refusals are permission violations, and an admin can do each of them',
  async () => {
    if (violations < 10)
      throw new Error(`only ${violations} permission violations were reported`)
    // The same operations succeed for an admin, so the refusals above are the
    // permissions and not a mistake in how the call was made.
    await adminJsm.consumers.info(STREAM, consumerName(B, 'jobs'))
    await adminJsm.streams.info('OTHER')
    await adminJsm.streams.getMessage(STREAM, { seq: 1 })
    await adminJsm.streams.add({ name: 'MINE', subjects: ['mine.>'] })
    await adminJsm.streams.delete('MINE')
    const c = await adminJsm.consumers.add(STREAM, {
      ...consumerConfig(A),
      durable_name: 'control',
      filter_subject: 'pikku.acme.control.x',
    })
    await adminJsm.consumers.delete(STREAM, c.name)
  }
)

console.log('\nCredentials')
await check('a wrong password does not connect', () =>
  denied('connect', () =>
    connect({
      servers: broker.url,
      user: A.user,
      pass: 'nope',
      reconnect: false,
      timeout: 2_000,
    })
  )
)
await check('no credentials do not connect', () =>
  denied('connect', () =>
    connect({ servers: broker.url, reconnect: false, timeout: 2_000 })
  )
)
await check("B's password does not log in as A", () =>
  denied('connect', () =>
    connect({
      servers: broker.url,
      user: A.user,
      pass: B.password,
      reconnect: false,
      timeout: 2_000,
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
      const info = await adminJsm.streams.info(STREAM, {
        subjects_filter: `${prefixOf(A)}.cron-target`,
      })
      return (info.state.subjects?.[`${prefixOf(A)}.cron-target`] ?? 0) >= 1
    })
  }
)
await check(
  'KNOWN LIMIT: a schedule may name another stage as its target',
  async () => {
    const hdrs = headers()
    hdrs.set('Nats-Schedule', '@at 2020-01-01T00:00:00Z')
    hdrs.set('Nats-Schedule-Target', `${prefixOf(B)}.jobs`)
    let accepted = true
    try {
      await a.js.publish(`${prefixOf(A)}._schedule.smuggle`, '{"smuggled":1}', {
        headers: hdrs,
      })
    } catch {
      accepted = false
    }
    await new Promise((r) => setTimeout(r, 1_500))
    const info = await adminJsm.streams.info(STREAM, {
      subjects_filter: `${prefixOf(B)}.>`,
    })
    const landed = (info.state.subjects?.[`${prefixOf(B)}.jobs`] ?? 0) > 1
    console.log(
      `      accepted=${accepted}, produced onto B's subject=${landed}`
    )
  }
)

console.log('\nAdding and removing a user without restarting the broker')
await check(
  'a reloaded config adds a user, and removing one drops its connection',
  async () => {
    const C: Stage = {
      project: 'acme',
      stage: 'gamma',
      user: 'acme-gamma',
      password: 'pw-c',
      queues,
    }
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
    await until('the new user to log in', async () => {
      try {
        const nc = await connect({
          servers: broker.url,
          user: C.user,
          pass: C.password,
          reconnect: false,
          timeout: 1_000,
        })
        connections.push(nc)
        return true
      } catch {
        return false
      }
    })
    const before = connections[connections.length - 1]!
    broker.rewrite([A, B])
    broker.reload()
    await until(
      'the removed user to be dropped',
      async () => before.isClosed(),
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
    if (a.nc.isClosed()) throw new Error('an unrelated stage was disconnected')
  }
)

for (const nc of connections) await nc.close().catch(() => {})
await adminNc.close()
broker.stop()
if (failures > 0) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
