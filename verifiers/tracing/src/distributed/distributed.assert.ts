/**
 * One trace across real processes: each service is an OS process, the hops are
 * real HTTP and a real Redis, and the mesh JWTs are really signed and checked.
 * The assertions read what each process recorded from its own wire, so a parent
 * chain rebuilt here is one a Tracer could rebuild from the same data.
 *
 * Needs `REDIS_TEST_URL`; `scripts/test-trace-adapters.sh` starts a Redis.
 */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { buildMeshHeaders } from '@pikku/core/mesh'
import { LocalSecretService, LocalVariablesService } from '@pikku/core/services'
import { ConsoleLogger } from '@pikku/core/services'
import { JoseJWTService } from '@pikku/jose'
import type { DistRecord } from './recorder.js'

const REDIS = process.env.REDIS_TEST_URL
const MESH_SECRET = 'distributed-trace-suite-mesh-secret-of-enough-length'

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

const dir = mkdtempSync(join(tmpdir(), 'pikku-distributed-'))
const file = join(dir, 'records.jsonl')
const peers: Record<string, string> = {}
const ports: Record<string, number> = {}
const processes = new Map<string, ChildProcess>()

const start = (role: string) =>
  new Promise<ChildProcess>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'src/distributed/service.ts'],
      {
        env: {
          ...process.env,
          DIST_ROLE: role,
          DIST_PORT: String(ports[role]),
          DIST_PEERS: JSON.stringify(peers),
          DIST_RECORD_FILE: file,
          DIST_TRUST: String(role === 'e'),
          PIKKU_MESH_SECRET: MESH_SECRET,
        },
        stdio: ['ignore', 'pipe', 'inherit'],
      }
    )
    processes.set(role, child)
    child.stdout!.on('data', (chunk) => {
      if (String(chunk).includes('ready')) resolve(child)
    })
    child.once('exit', (code) => reject(new Error(`${role} exited: ${code}`)))
  })

const stop = (child: ChildProcess) =>
  new Promise<number | null>((resolve) => {
    child.removeAllListeners('exit')
    child.once('exit', resolve)
    child.kill('SIGTERM')
  })

const records = (): DistRecord[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

const wait = async <T>(what: string, find: () => T | undefined | false) => {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const found = find()
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.fail(`never saw ${what}`)
}

const post = async (
  role: string,
  route: string,
  body: object,
  headers: Record<string, string> = {}
) => {
  const response = await fetch(`${peers[role]}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, any>,
  }
}

const nonce = () => randomBytes(8).toString('hex')

const hops = (run: string) =>
  records().filter((entry) => entry.kind === 'hop' && entry.run === run)

const hopAt = (run: string, at: string) =>
  wait(`${at} of ${run}`, () => hops(run).find((entry) => entry.at === at))

const hopsAt = (run: string, at: string) =>
  hops(run).filter((entry) => entry.at === at)

/** Walks from a hop to the root through every span the processes recorded. */
const path = (entry: DistRecord) => {
  const spans = new Map<string, DistRecord>()
  for (const seen of records()) {
    if (seen.spanId && seen.traceId === entry.traceId) {
      if (!spans.has(seen.spanId) || seen.kind === 'hop') {
        spans.set(seen.spanId, seen)
      }
    }
  }
  const walked = [entry]
  let at = entry
  while (at.parentSpanId) {
    const parent = spans.get(at.parentSpanId)
    assert.ok(parent, `no process recorded the parent of ${at.role} ${at.at}`)
    walked.unshift(parent)
    at = parent
  }
  return walked
}

const labels = (entry: DistRecord) =>
  path(entry)
    .map((seen) => `${seen.role}:${seen.at ?? 'edge'}`)
    .join(' > ')

const errorRoles = (traceId: string) =>
  new Set(
    records()
      .filter(
        (entry) =>
          entry.kind === 'log' &&
          entry.level === 'error' &&
          entry.traceId === traceId
      )
      .map((entry) => entry.role)
  )

describe(
  'one trace across processes',
  { skip: REDIS ? undefined : 'needs REDIS_TEST_URL' },
  () => {
    before(async () => {
      writeFileSync(file, '')
      for (const role of ['a', 'b', 'c', 'c2', 'd', 'e', 'f']) {
        ports[role] = await freePort()
        peers[role] = `http://127.0.0.1:${ports[role]}`
      }
      await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map(start))
    })

    after(async () => {
      await Promise.all([...processes.values()].map(stop))
      rmSync(dir, { recursive: true, force: true })
    })

    test('A > mesh B > job on Redis > worker C > workflow > mesh D and addon', async () => {
      const run = nonce()
      const { status, body } = await post('a', '/dist/chain', { run })
      assert.equal(status, 200)

      const entry = await hopAt(run, 'entry')
      const enqueue = await hopAt(run, 'enqueue')
      const job = await hopAt(run, 'job')
      const stepMesh = await hopAt(run, 'step-mesh')
      const stepAddon = await hopAt(run, 'step-addon')
      const d = await hopAt(run, 'd')
      const addon = await hopAt(run, 'addon')

      assert.equal(body.traceId, entry.traceId)
      assert.equal(entry.role, 'a')
      assert.equal(enqueue.role, 'b')
      assert.equal(job.role, 'c')
      assert.equal(d.role, 'd')
      assert.equal(addon.role, 'e')
      for (const hop of hops(run)) {
        assert.equal(hop.traceId, entry.traceId, `${hop.at} left the trace`)
      }
      const spans = hops(run).map(({ spanId }) => spanId)
      assert.equal(new Set(spans).size, spans.length, 'a span repeats')

      assert.equal(entry.parentSpanId, undefined)
      assert.equal(job.parentSpanId, enqueue.spanId)
      // A hop that arrives over HTTP goes through a handler with its own span
      // (`edge`), so each line below is one unbroken parent chain.
      assert.equal(
        labels(d),
        'a:entry > b:edge > b:enqueue > c:job > c:step-mesh > d:edge > d:d'
      )
      assert.equal(
        labels(addon),
        'a:entry > b:edge > b:enqueue > c:job > c:step-addon > e:edge > e:addon'
      )

      // The expected gap: a workflow's tree is flat by design, so a later step
      // hangs off the same span as the first and not off the step before it.
      // knowledge: decisions/internals/a-workflow-run-owns-its-trace.md
      assert.equal(stepAddon.parentSpanId, stepMesh.parentSpanId)
      assert.notEqual(stepAddon.parentSpanId, stepMesh.spanId)
    })

    test('fan-out: siblings share a parent and have spans of their own', async () => {
      const run = nonce()
      const targets = ['b', 'd', 'e', 'f']
      const { status } = await post('a', '/dist/fan-out', { run, targets })
      assert.equal(status, 200)
      const entry = await hopAt(run, 'entry')
      const leaves = await Promise.all(targets.map((to) => hopAt(run, to)))
      assert.deepEqual(
        leaves.map(({ role }) => role),
        targets
      )
      const handlers = leaves.map((leaf) => path(leaf).at(-2)!)
      for (const handler of handlers) {
        assert.equal(handler.parentSpanId, entry.spanId)
        assert.equal(handler.traceId, entry.traceId)
      }
      const spans = leaves.flatMap(({ spanId }) => spanId)
      spans.push(...handlers.map(({ spanId }) => spanId))
      assert.equal(new Set(spans).size, spans.length)
    })

    test('concurrent requests never share or swap a trace', async () => {
      const runs = Array.from({ length: 24 }, nonce)
      await Promise.all(
        runs.map((run) =>
          post('a', '/dist/fan-out', { run, targets: ['b', 'd'] })
        )
      )
      const traces = new Set<string>()
      for (const run of runs) {
        const seen = hops(run)
        assert.equal(seen.length, 3)
        const [traceId, ...others] = new Set(seen.map((hop) => hop.traceId))
        assert.deepEqual(others, [], 'a run crossed traces')
        traces.add(traceId!)
      }
      assert.equal(traces.size, runs.length)
    })

    test('a failure deep in the chain surfaces upstream on the same trace', async () => {
      const run = nonce()
      const { status, body } = await post('a', '/dist/fails', { run })
      assert.equal(status, 500)
      const entry = await hopAt(run, 'entry')
      const relay = await hopAt(run, 'relay')
      const leaf = await hopAt(run, 'd')
      assert.equal(leaf.role, 'd')
      assert.equal(relay.traceId, entry.traceId)
      assert.equal(leaf.traceId, entry.traceId)
      assert.equal(body.errorId, entry.traceId)
      assert.deepEqual([...errorRoles(entry.traceId!)].sort(), ['a', 'b', 'd'])
    })

    test('a failing job in the worker logs under the caller’s trace', async () => {
      const run = nonce()
      await post('a', '/dist/chain', { run, jobFails: true })
      const job = await hopAt(run, 'job')
      const entry = await hopAt(run, 'entry')
      assert.equal(job.traceId, entry.traceId)
      await wait('the worker logging it', () =>
        errorRoles(entry.traceId!).has('c')
      )
    })

    test('a caller that times out and a callee that carries on keep the trace', async () => {
      const run = nonce()
      const { status, body } = await post('a', '/dist/times-out', { run })
      assert.equal(status, 504)
      const entry = await hopAt(run, 'entry')
      assert.equal(body.errorId, entry.traceId)
      const late = await hopAt(run, 'slow-after-the-caller-left')
      const work = await hopAt(run, 'late-work')
      assert.equal(late.role, 'e')
      assert.equal(late.traceId, entry.traceId)
      assert.equal(work.traceId, entry.traceId)
      assert.equal(work.parentSpanId, late.spanId)
    })

    test('a retried mesh call is a new span with the same parent', async () => {
      const run = nonce()
      const { status } = await post('a', '/dist/retries', { run })
      assert.equal(status, 200)
      const entry = await hopAt(run, 'entry')
      await wait('both attempts', () => hopsAt(run, 'flaky').length === 2)
      const handlers = hopsAt(run, 'flaky').map((leaf) => path(leaf).at(-2)!)
      assert.equal(handlers[0].parentSpanId, entry.spanId)
      assert.equal(handlers[1].parentSpanId, entry.spanId)
      assert.notEqual(handlers[0].spanId, handlers[1].spanId)
      for (const leaf of hopsAt(run, 'flaky')) {
        assert.equal(leaf.traceId, entry.traceId)
      }
    })

    test('a retried job is a new span with the same parent', async () => {
      const run = nonce()
      await post('a', '/dist/chain', { run, jobFailsOnce: true })
      const enqueue = await hopAt(run, 'enqueue')
      await wait('both attempts', () => hopsAt(run, 'job').length === 2)
      const [first, second] = hopsAt(run, 'job')
      assert.equal(first.parentSpanId, enqueue.spanId)
      assert.equal(second.parentSpanId, enqueue.spanId)
      assert.notEqual(first.spanId, second.spanId)
      assert.equal(second.traceId, enqueue.traceId)
    })

    describe('trust boundaries', () => {
      const trace = '7e57ab1ec0de7e57ab1ec0de7e57ab1e'
      const traceparent = `00-${trace}-00f067aa0ba902b7-01`

      const secrets = () => {
        const service = new LocalSecretService(new LocalVariablesService())
        process.env.PIKKU_MESH_SECRET = randomBytes(32).toString('hex')
        return service
      }

      test('a public request cannot choose its trace', async () => {
        const run = nonce()
        await post('a', '/dist/retries', { run }, { traceparent })
        const entry = await hopAt(run, 'entry')
        assert.notEqual(entry.traceId, trace)
        assert.equal(entry.parentSpanId, undefined)
      })

      test('mesh with no token is refused and adopts nothing', async () => {
        const run = nonce()
        const { status, body } = await post(
          'b',
          '/mesh/rpc/distLeaf',
          { rpcName: 'distLeaf', data: { run } },
          { traceparent }
        )
        assert.equal(status, 401)
        assert.notEqual(body.errorId, trace)
        assert.deepEqual(hops(run), [])
        assert.ok(!records().some(({ traceId }) => traceId === trace))
      })

      test('mesh with a token from the wrong key adopts nothing', async () => {
        const run = nonce()
        const jwt = new JoseJWTService(
          async () => [{ id: 'forged', value: 'not-the-signing-key' }],
          new ConsoleLogger()
        )
        await jwt.init()
        const headers = await buildMeshHeaders(
          jwt,
          secrets(),
          'distLeaf',
          undefined,
          traceparent
        )
        const { status, body } = await post(
          'b',
          '/mesh/rpc/distLeaf',
          { rpcName: 'distLeaf', data: { run } },
          headers
        )
        assert.equal(status, 401)
        assert.notEqual(body.errorId, trace)
        assert.deepEqual(hops(run), [])
        assert.ok(!records().some(({ traceId }) => traceId === trace))
      })

      test('an addon host with trustInboundTraceparent continues the trace', async () => {
        const run = nonce()
        const { body } = await post('a', '/dist/addon', {
          run,
          namespace: 'trusted',
        })
        const entry = await hopAt(run, 'entry')
        const leaf = await hopAt(run, 'addon')
        assert.equal(leaf.role, 'e')
        assert.equal(leaf.traceId, entry.traceId)
        assert.equal(body.at, entry.traceId)
        assert.equal(path(leaf).at(-2)!.parentSpanId, entry.spanId)
      })

      test('an addon host without it starts a trace of its own', async () => {
        const run = nonce()
        await post('a', '/dist/addon', { run, namespace: 'untrusted' })
        const entry = await hopAt(run, 'entry')
        const leaf = await hopAt(run, 'addon')
        assert.equal(leaf.role, 'f')
        assert.notEqual(leaf.traceId, entry.traceId)
        assert.equal(path(leaf)[0].parentSpanId, undefined)
      })
    })

    test('a job on the broker outlives its worker and keeps the trace', async () => {
      const run = nonce()
      await post('a', '/dist/chain', { run, delay: 1500 })
      const enqueue = await hopAt(run, 'enqueue')
      assert.equal(await stop(processes.get('c')!), 0, 'not a graceful stop')
      processes.delete('c')
      await new Promise((resolve) => setTimeout(resolve, 1800))
      assert.deepEqual(hopsAt(run, 'job'), [], 'no worker should be left')

      await start('c2')
      const job = await hopAt(run, 'job')
      assert.equal(job.role, 'c2')
      assert.equal(job.traceId, enqueue.traceId)
      assert.equal(job.parentSpanId, enqueue.spanId)
      await hopAt(run, 'd')
    })
  }
)
