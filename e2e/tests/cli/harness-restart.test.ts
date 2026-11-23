/**
 * Kill the server while the harness loop is inside a step and start it again on
 * the same SQLite file: the run finishes `done` on attempt 2 with the feedback
 * an uninterrupted run gives, every step that had settled before the kill runs
 * once, and only the step the kill caught runs again, as a new attempt.
 *
 * e2e wires its own SQLite workflow services (src/services.ts), so this tests
 * the core workflow engine's recovery of `harnessLoopWorkflow`, not the
 * services a generated `pikku serve` builds for a configured database.
 *
 * The working directory is under the repo's git-ignored `.tmp/`.
 */
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { startBackend } from '../../bin/backend-harness.js'

const repoTmp = fileURLToPath(new URL('../../../.tmp/', import.meta.url))
mkdirSync(repoTmp, { recursive: true })
const dir = mkdtempSync(join(repoTmp, 'harness-restart-'))
process.env.SQLITE_PATH = join(dir, 'runs.sqlite')
process.env.HARNESS_LEDGER_DIR = dir
process.env.WORKFLOW_RECOVERY_MS = '1000'

const HARNESS = 'harnessLoopWorkflow'
const USER = 'harness-restart-user'
const HOLD_MS = 600_000

const anyType = {
  file: 'src/todo.ts',
  line: 12,
  severity: 'high',
  rule: 'no-explicit-any',
  message: 'Unexpected any',
}

let server: Awaited<ReturnType<typeof startBackend>> | undefined
let apiUrl: string | undefined

after(() => {
  server?.kill('SIGKILL')
  rmSync(dir, { recursive: true, force: true })
})

type Invocation = {
  key: string
  runId: string
  invocationId?: string
  attempt: number
}

const invocations = (): Invocation[] => {
  try {
    return readFileSync(
      join(dir, 'private', 'chaos', 'chaos-ledger.jsonl'),
      'utf8'
    )
      .trim()
      .split('\n')
      .filter(Boolean)
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
  assert.fail(`Timed out waiting for ${what}: ${JSON.stringify(invocations())}`)
}

const request = async (
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
) => {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-user-id': USER },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  assert.ok(response.ok, `${path}: ${response.status} ${text}`)
  return text ? JSON.parse(text) : undefined
}

const startRun = async (input: unknown): Promise<string> =>
  (await request('POST', `/workflow/${HARNESS}/start`, { data: input }))
    .runId as string

const runStatus = (runId: string) =>
  request('GET', `/workflow/${HARNESS}/status/${runId}`)

/** Waits for the run to complete and returns its output. */
const finished = async (runId: string, timeoutMs: number) => {
  let last: any
  await waitFor(
    async () => {
      last = await runStatus(runId)
      return last.status === 'completed'
    },
    `run ${runId} to complete`,
    timeoutMs
  )
  return last.output
}

/** Step attempts at `key` within one run, which must be one logical call. */
const attemptsAt = (runId: string, key: string): number[] => {
  const matching = invocations().filter(
    (entry) => entry.runId === runId && entry.key === key
  )
  assert.ok(matching.length > 0, `${key} never ran in ${runId}`)
  assert.equal(
    new Set(matching.map(({ invocationId }) => invocationId)).size,
    1,
    `${key} ran as more than one invocation`
  )
  return matching.map(({ attempt }) => attempt)
}

const boot = async () => {
  server = await startBackend(apiUrl ? { apiUrl } : undefined)
  await server.waitUntilReady({ timeoutMs: 120_000 })
  apiUrl = server.apiUrl
}

/** The output of the same change with nothing interrupted. */
let uninterrupted: any

before(async () => {
  await boot()
  const runId = await startRun({
    changeId: 'c-baseline',
    failOn: 'high',
    gateRuns: [{ findings: [anyType] }, { findings: [] }],
  })
  uninterrupted = await finished(runId, 30_000)
  assert.equal(uninterrupted.status, 'done')
  assert.equal(uninterrupted.attempts, 2)
})

const survivesKill = async (
  input: Record<string, unknown>,
  caughtKey: string,
  settledKeys: string[]
) => {
  if (!server) await boot()
  const runId = await startRun(input)
  await waitFor(
    () => invocations().some((e) => e.runId === runId && e.key === caughtKey),
    `${caughtKey} to start`
  )
  // Long enough for the steps before it to reach the database.
  await sleep(500)

  server!.kill('SIGKILL')
  server = undefined
  await sleep(500)
  await boot()

  // A run killed mid-step waits for the dead pass's lease to lapse.
  const output = await finished(runId, 120_000)
  assert.equal(output.status, 'done')
  assert.equal(output.attempts, 2)
  assert.deepEqual(output.feedbackHistory, uninterrupted.feedbackHistory)
  assert.equal(output.feedbackHeard, uninterrupted.feedbackHeard)

  for (const key of settledKeys) {
    assert.deepEqual(attemptsAt(runId, key), [1], key)
  }
  assert.deepEqual(attemptsAt(runId, caughtKey), [1, 2], caughtKey)

  server!.kill('SIGKILL')
  server = undefined
  await sleep(500)
}

test(
  'the loop finishes after a kill -9 during the attempt-1 gate',
  { timeout: 300_000 },
  () =>
    survivesKill(
      {
        changeId: 'c-kill-gate',
        failOn: 'high',
        gateRuns: [{ findings: [anyType], delayMs: HOLD_MS }, { findings: [] }],
      },
      'harnessFakeGate:1',
      ['harnessFakeAgent:1', 'harnessFakeAgent:2', 'harnessFakeGate:2']
    )
)

test(
  'the loop finishes after a kill -9 during the attempt-2 agent',
  { timeout: 300_000 },
  () =>
    survivesKill(
      {
        changeId: 'c-kill-agent',
        failOn: 'high',
        gateRuns: [{ findings: [anyType] }, { findings: [] }],
        agentDelayMs: [0, HOLD_MS],
      },
      'harnessFakeAgent:2',
      ['harnessFakeAgent:1', 'harnessFakeGate:1', 'harnessFakeGate:2']
    )
)
