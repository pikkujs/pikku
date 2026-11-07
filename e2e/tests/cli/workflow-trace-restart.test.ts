/**
 * Kill the server under running workflows and start it again on the same
 * database: every run finishes, nothing that had settled runs twice, and every
 * effect stays on the trace the run started with. It needs a process to kill,
 * which is why this is not a scenario, and a file database, because `:memory:`
 * dies with it.
 *
 * Each server carries a run in each shape a crash can catch: asleep with its
 * timer about to die, mid-step inside an orchestration pass, and fanned out with
 * one shard finished and two still in flight.
 */
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { startBackend } from '../../bin/backend-harness.js'

const dir = mkdtempSync(join(tmpdir(), 'pikku-trace-restart-'))
process.env.SQLITE_PATH = join(dir, 'runs.sqlite')
process.env.CHAOS_LEDGER_DIR = dir
process.env.WORKFLOW_RECOVERY_MS = '1000'

let server: Awaited<ReturnType<typeof startBackend>> | undefined

after(() => {
  server?.kill('SIGKILL')
  rmSync(dir, { recursive: true, force: true })
})

type Effect = {
  key: string
  runId: string
  invocationId?: string
  attempt: number
  traceId?: string
}

const effects = (): Effect[] => {
  try {
    return readFileSync(
      join(dir, 'private', 'chaos', 'chaos-ledger.jsonl'),
      'utf8'
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async (
  check: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 30_000
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await sleep(100)
  }
  assert.fail(`Timed out waiting for ${what}: ${JSON.stringify(effects())}`)
}

const post = async (apiUrl: string, path: string, body: unknown) => {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  assert.ok(response.ok, `${path}: ${response.status} ${text}`)
  return text ? JSON.parse(text) : undefined
}

const seen = (key: string) => effects().some((effect) => effect.key === key)

/** Every attempt at `key`, which must all be the one logical call. */
const attemptsAt = (key: string): number[] => {
  const matching = effects().filter((effect) => effect.key === key)
  assert.ok(matching.length > 0, `${key} never ran`)
  assert.equal(
    new Set(matching.map(({ invocationId }) => invocationId)).size,
    1,
    `${key} ran as more than one invocation`
  )
  return matching.map(({ attempt }) => attempt)
}

const restartsCleanly = async (signal: NodeJS.Signals, tag: string) => {
  server = await startBackend()
  await server.waitUntilReady({ timeoutMs: 120_000 })
  const { apiUrl } = server
  const start = async (workflow: string, data: unknown) =>
    (await post(apiUrl, `/workflow/${workflow}/start`, { data }))
      .runId as string

  const [sleeping, stepping, fanout] = [
    await start('chaosRestartWorkflow', {
      tag: `sleep-${tag}`,
      sleepFor: '4s',
    }),
    await start('chaosRestartWorkflow', {
      tag: `step-${tag}`,
      sleepFor: '100ms',
      phaseTwoDelayMs: 600_000,
    }),
    await start('chaosFanoutWorkflow', {
      batchId: tag,
      shards: 3,
      slowShards: [1, 2],
      slowShardDelayMs: 600_000,
    }),
  ]

  await waitFor(
    () =>
      seen(`phase1:sleep-${tag}`) &&
      seen(`phase2:step-${tag}`) &&
      seen(`shard:${tag}:1`) &&
      seen(`shard:${tag}:2`),
    'every run to be where the kill should catch it'
  )
  // Long enough for the fast shard's result to reach the database, which is
  // what makes a second run of it a duplicate rather than an at-least-once retry.
  await sleep(500)

  server.kill(signal)
  await sleep(500)
  assert.equal(
    effects().some(({ key }) => key === `phase2:sleep-${tag}`),
    false,
    'the kill landed before the sleeping run woke'
  )

  server = await startBackend({ apiUrl })
  await server.waitUntilReady({ timeoutMs: 120_000 })

  const status = async (runId: string) =>
    (await post(apiUrl, '/rpc/chaosRunTrace', { data: { runId } })).status
  // A run killed mid-step cannot move until the dead pass's 30s lease lapses.
  for (const runId of [sleeping, stepping, fanout]) {
    await waitFor(
      async () => (await status(runId)) === 'completed',
      `run ${runId} to finish`,
      90_000
    )
  }

  // Settled work ran exactly once.
  for (const key of [
    `phase1:sleep-${tag}`,
    `phase2:sleep-${tag}`,
    `phase3:sleep-${tag}`,
    `phase1:step-${tag}`,
    `phase3:step-${tag}`,
    `shard:${tag}:0`,
  ]) {
    assert.deepEqual(attemptsAt(key), [1], key)
  }
  // Work a kill caught in flight ran again, as the same invocation and as a
  // counted attempt.
  for (const key of [
    `phase2:step-${tag}`,
    `shard:${tag}:1`,
    `shard:${tag}:2`,
  ]) {
    assert.deepEqual(attemptsAt(key), [1, 2], key)
  }

  // Every effect, before and after the kill, is on the run's own trace.
  for (const runId of [sleeping, stepping, fanout]) {
    const { traceparent } = await post(apiUrl, '/rpc/chaosRunTrace', {
      data: { runId },
    })
    const traceId = traceparent?.split('-')[1]
    assert.ok(traceId, `run ${runId} kept no trace`)
    for (const effect of effects().filter((e) => e.runId === runId)) {
      assert.equal(effect.traceId, traceId, effect.key)
    }
  }

  server.kill('SIGKILL')
  server = undefined
  await sleep(500)
}

test('runs finish after a kill -9', { timeout: 300_000 }, () =>
  restartsCleanly('SIGKILL', 'kill')
)

test('runs finish after a SIGTERM', { timeout: 300_000 }, () =>
  restartsCleanly('SIGTERM', 'term')
)
