/**
 * Workflow load benchmark.
 *
 * Runs hundreds of DSL workflows concurrently, each with many RPC steps, where
 * a deterministic ~2/3 of steps fail transiently on their first one or two
 * attempts (mimicking flaky real-world work). The point is correctness under
 * load: EVERY run must reach `completed` and every step must produce its result
 * once retries ride out the transient failures — nothing dropped, nothing stuck.
 *
 * Drives the engine directly via pikkuState wiring (no codegen), the same way
 * the HTTP benchmarks register functions, so it runs with a plain `tsx`:
 *
 *   yarn workspace @pikku/workspace tsx benchmarks/bench-workflow.ts
 *   tsx benchmarks/bench-workflow.ts --runs 500 --steps 30
 */

import { addFunction } from '@pikku/core'
import { pikkuState, resetPikkuState } from '@pikku/core/internal'
import { InMemoryWorkflowService } from '@pikku/core/services'
import { addWorkflow } from '@pikku/core/workflow'
import { rpcService } from '@pikku/core/rpc'

const arg = (flag: string, fallback: number): number => {
  const i = process.argv.indexOf(flag)
  if (i === -1 || i + 1 >= process.argv.length) return fallback
  const v = Number(process.argv[i + 1])
  return Number.isFinite(v) ? v : fallback
}

const RUNS = arg('--runs', 300)
const STEPS = arg('--steps', 20)

const WORKFLOW_NAME = 'benchWorkflow'
const STEP_RPC = 'benchStep'

// Per-step attempt counter, keyed by the run-stable `${wfId}:${stepIdx}`. The
// step throws while its count is within its assigned `failTimes`, then succeeds
// — so a fresh process sees the same flaky-then-recovering behavior every run.
const attempts = new Map<string, number>()
let totalAttempts = 0

// Cheap deterministic string hash → assign each step 0, 1 or 2 transient
// failures. Deterministic so the DSL body (which computes failTimes) replays
// identically and the benchmark is reproducible.
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

function registerEngine() {
  resetPikkuState()

  pikkuState(null, 'package', 'singletonServices', {
    logger: { error() {}, info() {}, warn() {}, debug() {} },
  } as any)
  pikkuState(null, 'package', 'factories', {
    createWireServices: async () => ({}),
  } as any)

  // Flaky step RPC: fails its first `failTimes` attempts, then returns a result.
  pikkuState(null, 'rpc', 'meta')[STEP_RPC] = STEP_RPC as any
  pikkuState(null, 'function', 'meta')[STEP_RPC] = {
    pikkuFuncId: STEP_RPC,
    sessionless: true,
    permissions: [],
    inputSchemaName: null,
    outputSchemaName: null,
  } as any
  addFunction(STEP_RPC, {
    func: async (
      _services: any,
      data: { wfId: string; stepIdx: number; failTimes: number }
    ) => {
      const key = `${data.wfId}:${data.stepIdx}`
      const count = (attempts.get(key) ?? 0) + 1
      attempts.set(key, count)
      totalAttempts++
      if (count <= data.failTimes) {
        throw new Error(
          `transient failure ${count}/${data.failTimes} on ${key}`
        )
      }
      return randomPayload(data.stepIdx + count)
    },
  } as any)

  // DSL workflow: run STEPS sequential RPC steps, each with deterministic flakiness.
  pikkuState(null, 'workflows', 'meta')[WORKFLOW_NAME] = {
    name: WORKFLOW_NAME,
    pikkuFuncId: WORKFLOW_NAME,
    source: 'dsl',
    graphHash: 'bench-workflow-hash',
  } as any
  pikkuState(null, 'function', 'meta')[WORKFLOW_NAME] = {
    name: WORKFLOW_NAME,
    sessionless: true,
    permissions: [],
    inputSchemaName: null,
    outputSchemaName: null,
  } as any
  addWorkflow(WORKFLOW_NAME, {
    func: async (_services: any, data: { wfId: string; steps: number }, { workflow }: any) => {
      const results: number[] = []
      for (let i = 0; i < data.steps; i++) {
        const out = await workflow.do(`s${i}`, STEP_RPC, {
          wfId: data.wfId,
          stepIdx: i,
          failTimes: failTimesFor(data.wfId, i),
        })
        results.push(out.id)
      }
      return { wfId: data.wfId, completed: results.length }
    },
  } as any)
}

async function main() {
  registerEngine()

  const ws = new InMemoryWorkflowService()
  // No queueService configured → runs execute inline (in-process), exercising
  // the inline step retry loop under concurrent load.
  const rpc = rpcService.getContextRPCService(
    getSingletonServicesRef(),
    {} as any,
    false
  )

  console.log(
    `=== Workflow load benchmark ===\n` +
      `runs=${RUNS} steps/run=${STEPS} total steps=${RUNS * STEPS}\n`
  )

  const start = performance.now()
  const settled = await Promise.allSettled(
    Array.from({ length: RUNS }, async (_, i) => {
      const wfId = `wf-${i}`
      const { runId } = await ws.startWorkflow(
        WORKFLOW_NAME,
        { wfId, steps: STEPS },
        { type: 'bench' } as any,
        rpc,
        { inline: true }
      )
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
    })
  )
  const elapsedMs = performance.now() - start

  const failed = settled.filter((s) => s.status === 'rejected')
  const ok = settled.length - failed.length
  const totalSteps = RUNS * STEPS

  console.log('=== Results ===')
  console.log(`completed runs : ${ok}/${RUNS}`)
  console.log(`total steps    : ${totalSteps}`)
  console.log(
    `total attempts : ${totalAttempts} (${(totalAttempts / totalSteps).toFixed(2)}x — retries from transient failures)`
  )
  console.log(`wall time      : ${elapsedMs.toFixed(0)}ms`)
  console.log(`throughput     : ${((RUNS / elapsedMs) * 1000).toFixed(0)} runs/s, ${((totalSteps / elapsedMs) * 1000).toFixed(0)} steps/s`)

  if (failed.length > 0) {
    console.log(`\n=== ${failed.length} FAILED ===`)
    for (const f of failed.slice(0, 10)) {
      console.log(`  ${(f as PromiseRejectedResult).reason?.message}`)
    }
    process.exit(1)
  }
  console.log('\nPASS: every workflow completed under load.')
  process.exit(0)
}

// getSingletonServices is internal; reach it through pikkuState the same way the
// engine does, so the rpc service and workflow service share one services object.
function getSingletonServicesRef(): any {
  return pikkuState(null, 'package', 'singletonServices')
}

main().catch((error) => {
  console.error('Benchmark crashed:', error)
  process.exit(1)
})
