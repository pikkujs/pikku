/**
 * Workflow load benchmark.
 *
 * Runs hundreds of DSL workflows concurrently, each with many steps, where a
 * deterministic ~2/3 of steps fail transiently on their first one or two
 * attempts (mimicking flaky real-world work). The point is correctness under
 * load: EVERY run must reach `completed` and every step must produce its result
 * once retries ride out the transient failures — nothing dropped, nothing stuck.
 *
 * Three transports, same workload, same assertions — proving the dispatch path
 * is transport-independent (switching a step inline↔queued changes only timing):
 *
 *   (default)  every step inline (in-process retry loop, no queue service)
 *   --mixed    alternate steps marked `inline: false` → dispatched through an
 *              in-process InMemoryQueueService (retry via queue redelivery)
 *   --queue    run orchestrated entirely through the queue (run-level inline:false)
 *
 * Drives the engine directly via pikkuState wiring (no codegen), the same way the
 * HTTP benchmarks register functions, so it runs with a plain `tsx`:
 *
 *   tsx benchmarks/bench-workflow.ts --runs 300 --steps 20
 *   tsx benchmarks/bench-workflow.ts --mixed --runs 200 --steps 16
 *   tsx benchmarks/bench-workflow.ts --queue --runs 200 --steps 16
 */

import { addFunction } from '@pikku/core'
import { pikkuState, resetPikkuState } from '@pikku/core/internal'
import { InMemoryWorkflowService, InMemoryQueueService } from '@pikku/core/services'
import { addWorkflow } from '@pikku/core/workflow'
import { rpcService } from '@pikku/core/rpc'

type Mode = 'inline' | 'mixed' | 'queue'

const arg = (flag: string, fallback: number): number => {
  const i = process.argv.indexOf(flag)
  if (i === -1 || i + 1 >= process.argv.length) return fallback
  const v = Number(process.argv[i + 1])
  if (!Number.isInteger(v) || v <= 0) {
    throw new Error(`${flag} must be a positive integer`)
  }
  return v
}

const MODE: Mode = process.argv.includes('--queue')
  ? 'queue'
  : process.argv.includes('--mixed')
    ? 'mixed'
    : 'inline'
const RUNS = arg('--runs', MODE === 'inline' ? 300 : 200)
const STEPS = arg('--steps', MODE === 'inline' ? 20 : 16)

const WORKFLOW_NAME = 'benchWorkflow'
const STEP_RPC = 'benchStep' // default → runs inline
const STEP_QUEUED_RPC = 'benchStepQueued' // inline: false → dispatched to the queue

// Per-step attempt counter, keyed by the run-stable `${wfId}:${stepIdx}`. The
// step throws while its count is within its assigned `failTimes`, then succeeds
// — so a fresh process sees the same flaky-then-recovering behavior every run.
const attempts = new Map<string, number>()
let totalAttempts = 0

// Cheap deterministic string hash → assign each step 0, 1 or 2 transient
// failures. Deterministic so the DSL body (which computes failTimes) replays
// identically and the benchmark is reproducible across runs and transports.
const failTimesFor = (wfId: string, stepIdx: number): number => {
  let h = 2166136261
  const s = `${wfId}:${stepIdx}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 3
}

// Random-ish payload to mimic real step output size without being a fixed blob.
const randomPayload = (seed: number) => ({
  id: seed,
  ts: seed * 31,
  tag: `payload-${seed % 97}`,
  values: Array.from({ length: 8 }, (_, i) => (seed * 7 + i) % 1000),
})

const flakyStep = async (
  _services: any,
  data: { wfId: string; stepIdx: number; failTimes: number }
) => {
  const key = `${data.wfId}:${data.stepIdx}`
  const count = (attempts.get(key) ?? 0) + 1
  attempts.set(key, count)
  totalAttempts++
  if (count <= data.failTimes) {
    throw new Error(`transient failure ${count}/${data.failTimes} on ${key}`)
  }
  return randomPayload(data.stepIdx + count)
}

const mkStepMeta = (funcId: string, inline?: boolean) =>
  ({
    pikkuFuncId: funcId,
    sessionless: true,
    permissions: [],
    inputSchemaName: null,
    outputSchemaName: null,
    ...(inline === undefined ? {} : { inline }),
  }) as any

function registerEngine(mode: Mode) {
  resetPikkuState()

  const singletonServices: any = {
    logger: { error() {}, info() {}, warn() {}, debug() {} },
  }
  // mixed/queue route dispatch through an in-process queue with retry redelivery.
  if (mode !== 'inline') {
    singletonServices.queueService = new InMemoryQueueService()
  }
  pikkuState(null, 'package', 'singletonServices', singletonServices)
  pikkuState(null, 'package', 'factories', {
    createWireServices: async () => ({}),
  } as any)

  // Default (inline) flaky step.
  pikkuState(null, 'rpc', 'meta')[STEP_RPC] = STEP_RPC as any
  pikkuState(null, 'function', 'meta')[STEP_RPC] = mkStepMeta(STEP_RPC)
  addFunction(STEP_RPC, { func: flakyStep } as any)

  // Same logic, but `inline: false` so it dispatches to the queue (mixed mode).
  pikkuState(null, 'rpc', 'meta')[STEP_QUEUED_RPC] = STEP_QUEUED_RPC as any
  pikkuState(null, 'function', 'meta')[STEP_QUEUED_RPC] = mkStepMeta(
    STEP_QUEUED_RPC,
    false
  )
  addFunction(STEP_QUEUED_RPC, { func: flakyStep } as any)

  // DSL workflow: run STEPS sequential steps; in mixed mode alternate steps use
  // the queued RPC so half the work crosses the queue transport.
  pikkuState(null, 'workflows', 'meta')[WORKFLOW_NAME] = {
    name: WORKFLOW_NAME,
    pikkuFuncId: WORKFLOW_NAME,
    source: 'dsl',
    graphHash: 'bench-workflow-hash',
  } as any
  pikkuState(null, 'function', 'meta')[WORKFLOW_NAME] = mkStepMeta(WORKFLOW_NAME)
  addWorkflow(WORKFLOW_NAME, {
    func: async (
      _services: any,
      data: { wfId: string; steps: number; mixed: boolean },
      { workflow }: any
    ) => {
      let completed = 0
      for (let i = 0; i < data.steps; i++) {
        const rpc = data.mixed && i % 2 === 1 ? STEP_QUEUED_RPC : STEP_RPC
        const out = await workflow.do(`s${i}`, rpc, {
          wfId: data.wfId,
          stepIdx: i,
          failTimes: failTimesFor(data.wfId, i),
        })
        if (out?.id !== undefined) completed++
      }
      return { wfId: data.wfId, completed }
    },
  } as any)
}

async function pollToCompletion(
  ws: InMemoryWorkflowService,
  runId: string,
  wfId: string,
  timeoutMs: number
): Promise<void> {
  const deadline = performance.now() + timeoutMs
  while (true) {
    const run = await ws.getRun(runId)
    if (run?.status === 'completed') {
      if ((run.output as any)?.completed !== STEPS) {
        throw new Error(
          `run ${wfId} completed ${(run.output as any)?.completed}/${STEPS} steps`
        )
      }
      return
    }
    if (run?.status === 'failed' || run?.status === 'cancelled') {
      throw new Error(
        `run ${wfId} ended '${run.status}': ${run.error?.message ?? 'unknown'}`
      )
    }
    if (performance.now() > deadline) {
      throw new Error(`run ${wfId} timed out in '${run?.status}'`)
    }
    await new Promise((r) => setTimeout(r, 20))
  }
}

async function main() {
  registerEngine(MODE)

  const ws = new InMemoryWorkflowService()
  // The queue workers (orchestrator/step-worker) resolve the workflow service
  // off the singleton services, so it must be present for queued dispatch.
  ;(pikkuState(null, 'package', 'singletonServices') as any).workflowService = ws
  const rpc = rpcService.getContextRPCService(
    pikkuState(null, 'package', 'singletonServices') as any,
    {} as any,
    false
  )

  const totalSteps = RUNS * STEPS
  console.log(
    `=== Workflow load benchmark (${MODE}) ===\n` +
      `runs=${RUNS} steps/run=${STEPS} total steps=${totalSteps}` +
      (MODE === 'mixed' ? ` (half dispatched through the queue)` : '') +
      '\n'
  )

  const start = performance.now()
  const settled = await Promise.allSettled(
    Array.from({ length: RUNS }, async (_, i) => {
      const wfId = `wf-${i}`
      const { runId } = await ws.startWorkflow(
        WORKFLOW_NAME,
        { wfId, steps: STEPS, mixed: MODE === 'mixed' },
        { type: 'bench' } as any,
        rpc,
        // queue mode orchestrates the whole run through the queue; inline/mixed
        // start the run in-process (queued steps still suspend to the queue).
        { inline: MODE !== 'queue' }
      )
      if (MODE === 'inline') {
        const run = await ws.getRun(runId)
        if (run?.status !== 'completed') {
          throw new Error(
            `run ${wfId} ended '${run?.status}': ${run?.error?.message ?? 'unknown'}`
          )
        }
        if ((run.output as any)?.completed !== STEPS) {
          throw new Error(
            `run ${wfId} completed ${(run.output as any)?.completed}/${STEPS} steps`
          )
        }
        return wfId
      }
      await pollToCompletion(ws, runId, wfId, 60_000)
      return wfId
    })
  )
  const elapsedMs = performance.now() - start

  const failed = settled.filter((s) => s.status === 'rejected')
  const ok = settled.length - failed.length

  console.log('=== Results ===')
  console.log(`completed runs : ${ok}/${RUNS}`)
  console.log(`total steps    : ${totalSteps}`)
  console.log(
    `total attempts : ${totalAttempts} (${(totalAttempts / totalSteps).toFixed(2)}x — retries from transient failures)`
  )
  console.log(`wall time      : ${elapsedMs.toFixed(0)}ms`)
  console.log(
    `throughput     : ${((RUNS / elapsedMs) * 1000).toFixed(0)} runs/s, ${((totalSteps / elapsedMs) * 1000).toFixed(0)} steps/s`
  )

  if (failed.length > 0) {
    console.log(`\n=== ${failed.length} FAILED ===`)
    for (const f of failed.slice(0, 10)) {
      console.log(`  ${(f as PromiseRejectedResult).reason?.message}`)
    }
    process.exit(1)
  }
  console.log(`\nPASS: every workflow completed under load (${MODE}).`)
  process.exit(0)
}

main().catch((error) => {
  console.error('Benchmark crashed:', error)
  process.exit(1)
})
