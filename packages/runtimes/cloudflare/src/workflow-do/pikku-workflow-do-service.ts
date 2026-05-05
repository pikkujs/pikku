import type { DurableObjectStorage } from '@cloudflare/workers-types'
import type { SerializedError } from '@pikku/core'
import {
  PikkuWorkflowService,
  type StepState,
  type StepStatus,
  type WorkflowPlannedStep,
  type WorkflowRun,
  type WorkflowRunMirror,
  type WorkflowRunWire,
  type WorkflowStatus,
  type WorkflowStepOptions,
  type WorkflowVersionStatus,
} from '@pikku/core/workflow'
import type {
  DoPendingAlarm,
  DoRunRecord,
  DoStepHistoryRecord,
  DoStepRecord,
} from './do-storage-types.js'

const KEY_RUN = 'run'
const KEY_STATE = 'state'
const KEY_STEP_ORDER = 'step:order'
const KEY_HISTORY_ORDER = 'step:historyOrder'
const KEY_ALARM_NEXT = 'alarm:next'
const stepKey = (id: string) => `step:${id}`
const stepNameKey = (name: string) => `step:byName:${name}`
const historyKey = (id: string) => `step:history:${id}`

/**
 * Step dispatch RPC contract — shared with `pikku-step-worker.ts`.
 */
export interface PikkuDoStepDispatch {
  runId: string
  stepName: string
  rpcName: string
  data: unknown
  retries?: number
  retryDelay?: string | number
}

/**
 * Step stub contract — anything that exposes `run(dispatch)`. Typically a
 * `WorkerEntrypoint` service binding or a stub returned by a dispatch
 * namespace `.get(scriptName)` lookup.
 */
export interface PikkuStepStub {
  run(input: PikkuDoStepDispatch): Promise<void>
}

/**
 * Default DO env shape. Per-step service bindings live as direct
 * properties keyed by the unit's kebab-case binding name (e.g.
 * `env['enrich-card']`). Override via the generic parameter for stricter
 * typing in user code.
 */
export type PikkuWorkflowDoEnv = Record<string, unknown>

const toStepBindingName = (rpcName: string): string =>
  rpcName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/**
 * Per-run Durable Object–backed `PikkuWorkflowService`.
 *
 * Inherits the full pikku orchestration loop (`runWorkflowJob`,
 * `orchestrateWorkflow`, `executeWorkflowStep`, replay machinery, child
 * workflows, retries) from the base class. Provides three things:
 *
 * 1. Storage methods backed by the DO's own `ctx.storage` instead of SQL.
 * 2. Locks as no-ops — DOs are single-threaded.
 * 3. Transport hooks (`dispatchStep`, `scheduleSleep`, `scheduleResume`,
 *    `scheduleOrchestratorRetry`) that use `setAlarm` and per-rpc step
 *    service bindings (resolved via `getStepStub(rpcName)`) instead of
 *    queues.
 *
 * The DO instance ID is the run ID — one DO per workflow run. All `runId`
 * arguments to methods on this service should match `ctx.id.toString()`;
 * the service asserts this.
 */
export abstract class PikkuWorkflowDoService<
  Env extends PikkuWorkflowDoEnv = PikkuWorkflowDoEnv,
> extends PikkuWorkflowService {
  constructor(
    protected readonly storage: DurableObjectStorage,
    protected readonly env: Env,
    protected readonly ownRunId: string,
    options?: { mirror?: WorkflowRunMirror }
  ) {
    super({ wireQueues: false, mirror: options?.mirror })
  }

  // ─── Storage methods (replace SQL with DO storage) ────────────────

  protected async createRunImpl(
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire,
    options?: {
      deterministic?: boolean
      plannedSteps?: WorkflowPlannedStep[]
    }
  ): Promise<string> {
    const id = wire?.id ?? this.ownRunId
    if (id !== this.ownRunId) {
      throw new Error(
        `PikkuWorkflowDoService is bound to runId=${this.ownRunId}; cannot create run with id=${id}`
      )
    }
    const now = Date.now()
    const run: DoRunRecord = {
      id,
      workflow: workflowName,
      status: 'running',
      input,
      output: undefined,
      error: undefined,
      inline,
      graphHash,
      deterministic: options?.deterministic ?? false,
      plannedSteps: options?.plannedSteps,
      wire,
      createdAt: now,
      updatedAt: now,
    }
    await this.storage.put(KEY_RUN, run)
    return id
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    if (id !== this.ownRunId) return null
    const r = await this.storage.get<DoRunRecord>(KEY_RUN)
    return r ? toWorkflowRun(r) : null
  }

  protected async updateRunStatusImpl(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    this.assertOwn(id)
    const r = await this.storage.get<DoRunRecord>(KEY_RUN)
    if (!r) return
    r.status = status
    if (output !== undefined) r.output = output
    if (error !== undefined) r.error = error
    r.updatedAt = Date.now()
    await this.storage.put(KEY_RUN, r)
  }

  protected async insertStepStateImpl(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: WorkflowStepOptions
  ): Promise<StepState> {
    this.assertOwn(runId)
    const stepId = crypto.randomUUID()
    const now = Date.now()
    const step: DoStepRecord = {
      stepId,
      stepName,
      rpcName,
      status: 'pending',
      data,
      attemptCount: 1,
      retries: stepOptions?.retries,
      retryDelay: stepOptions?.retryDelay,
      createdAt: now,
      updatedAt: now,
    }
    await this.storage.put(stepKey(stepId), step)
    await this.storage.put(stepNameKey(stepName), stepId)
    const order = (await this.storage.get<string[]>(KEY_STEP_ORDER)) ?? []
    order.push(stepId)
    await this.storage.put(KEY_STEP_ORDER, order)
    await this.appendHistory(stepId, 'pending')
    return toStepState(step)
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    this.assertOwn(runId)
    const stepId = await this.storage.get<string>(stepNameKey(stepName))
    if (!stepId) {
      throw new Error(
        `Step not found: runId=${runId}, stepName=${stepName}. Use insertStepState to create it.`
      )
    }
    const step = await this.storage.get<DoStepRecord>(stepKey(stepId))
    if (!step) {
      throw new Error(
        `Step record missing for stepId=${stepId} (runId=${runId}, stepName=${stepName})`
      )
    }
    return toStepState(step)
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    this.assertOwn(runId)
    const historyOrder =
      (await this.storage.get<string[]>(KEY_HISTORY_ORDER)) ?? []
    if (historyOrder.length === 0) return []

    const historyKeys = historyOrder.map(historyKey)
    const historyMap = await this.storage.get<DoStepHistoryRecord>(historyKeys)
    const stepIds = new Set<string>()
    const histories: DoStepHistoryRecord[] = []
    for (const id of historyOrder) {
      const h = historyMap.get(historyKey(id))
      if (!h) continue
      histories.push(h)
      stepIds.add(h.stepId)
    }

    const stepKeys = [...stepIds].map(stepKey)
    const stepMap = await this.storage.get<DoStepRecord>(stepKeys)

    return histories.map((h) => {
      const step = stepMap.get(stepKey(h.stepId))
      return {
        stepId: h.stepId,
        stepName: step?.stepName ?? 'unknown',
        status: h.status,
        result: h.result,
        error: h.error ?? undefined,
        attemptCount: step?.attemptCount ?? 1,
        retries: step?.retries,
        retryDelay: step?.retryDelay,
        createdAt: new Date(h.createdAt),
        updatedAt: new Date(h.createdAt),
      }
    })
  }

  protected async setStepRunningImpl(stepId: string): Promise<void> {
    await this.updateStep(stepId, (s) => {
      s.status = 'running'
      s.runningAt = Date.now()
    })
    await this.appendHistory(stepId, 'running')
  }

  protected async setStepScheduledImpl(stepId: string): Promise<void> {
    await this.updateStep(stepId, (s) => {
      s.status = 'scheduled'
      s.scheduledAt = Date.now()
    })
  }

  protected async setStepResultImpl(
    stepId: string,
    result: any
  ): Promise<void> {
    await this.updateStep(stepId, (s) => {
      s.status = 'succeeded'
      s.result = result
      s.error = undefined
      s.succeededAt = Date.now()
    })
    await this.appendHistory(stepId, 'succeeded', result)
  }

  protected async setStepChildRunIdImpl(
    stepId: string,
    childRunId: string
  ): Promise<void> {
    await this.updateStep(stepId, (s) => {
      s.childRunId = childRunId
    })
  }

  protected async setStepErrorImpl(
    stepId: string,
    error: Error
  ): Promise<void> {
    const serialized: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }
    await this.updateStep(stepId, (s) => {
      s.status = 'failed'
      s.error = serialized
      s.result = undefined
      s.failedAt = Date.now()
    })
    await this.appendHistory(stepId, 'failed', undefined, serialized)
  }

  protected async createRetryAttemptImpl(
    stepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState> {
    const updated = await this.updateStep(stepId, (s) => {
      s.status = status
      s.result = undefined
      s.error = undefined
      s.attemptCount = (s.attemptCount ?? 1) + 1
    })
    await this.appendHistory(stepId, status)
    return toStepState(updated)
  }

  async withRunLock<T>(_id: string, fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  async withStepLock<T>(
    _runId: string,
    _stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return fn()
  }

  async close(): Promise<void> {}

  // ─── Graph state methods ──────────────────────────────────────────

  async getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    failedNodeIds: string[]
    branchKeys: Record<string, string>
  }> {
    this.assertOwn(runId)
    const order = (await this.storage.get<string[]>(KEY_STEP_ORDER)) ?? []
    if (order.length === 0) {
      return { completedNodeIds: [], failedNodeIds: [], branchKeys: {} }
    }
    const records = await this.storage.get<DoStepRecord>(order.map(stepKey))

    const completedNodeIds: string[] = []
    const failedNodeIds: string[] = []
    const branchKeys: Record<string, string> = {}
    for (const id of order) {
      const s = records.get(stepKey(id))
      if (!s) continue
      if (s.status === 'succeeded') {
        completedNodeIds.push(s.stepName)
        if (s.branchTaken) branchKeys[s.stepName] = s.branchTaken
      } else if (s.status === 'failed') {
        const maxAttempts = (s.retries ?? 0) + 1
        if (s.attemptCount >= maxAttempts) failedNodeIds.push(s.stepName)
      }
    }
    return { completedNodeIds, failedNodeIds, branchKeys }
  }

  async getNodesWithoutSteps(
    runId: string,
    nodeIds: string[]
  ): Promise<string[]> {
    this.assertOwn(runId)
    if (nodeIds.length === 0) return []
    const result: string[] = []
    for (const id of nodeIds) {
      const existing = await this.storage.get<string>(stepNameKey(id))
      if (!existing) result.push(id)
    }
    return result
  }

  async getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>> {
    this.assertOwn(runId)
    if (nodeIds.length === 0) return {}
    const results: Record<string, any> = {}
    for (const name of nodeIds) {
      const stepId = await this.storage.get<string>(stepNameKey(name))
      if (!stepId) continue
      const step = await this.storage.get<DoStepRecord>(stepKey(stepId))
      if (step?.status === 'succeeded') {
        results[name] = step.result
      }
    }
    return results
  }

  protected async setBranchTakenImpl(
    stepId: string,
    branchKey: string
  ): Promise<void> {
    await this.updateStep(stepId, (s) => {
      s.branchTaken = branchKey
    })
  }

  protected async updateRunStateImpl(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    this.assertOwn(runId)
    const state =
      (await this.storage.get<Record<string, unknown>>(KEY_STATE)) ?? {}
    state[name] = value
    await this.storage.put(KEY_STATE, state)
  }

  async getRunState(runId: string): Promise<Record<string, unknown>> {
    this.assertOwn(runId)
    return (await this.storage.get<Record<string, unknown>>(KEY_STATE)) ?? {}
  }

  // ─── Workflow versions: v0 stub (per-run only) ────────────────────
  //
  // Versions are global across runs; storing them in a per-run DO means
  // each run only knows its own version. That's enough for replay safety
  // (run pinned to a specific graphHash) but not for cross-run version
  // listing. Cross-run listing/AI-generated workflow lookup needs a
  // separate index (D1 or singleton DO) — v0.1 work.

  protected async upsertWorkflowVersionImpl(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status: WorkflowVersionStatus = 'active'
  ): Promise<void> {
    await this.storage.put(`version:${name}:${graphHash}`, {
      name,
      graphHash,
      graph,
      source,
      status,
    })
  }

  protected async updateWorkflowVersionStatusImpl(
    name: string,
    graphHash: string,
    status: WorkflowVersionStatus
  ): Promise<void> {
    const key = `version:${name}:${graphHash}`
    const v = await this.storage.get<any>(key)
    if (!v) return
    v.status = status
    await this.storage.put(key, v)
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    const v = await this.storage.get<any>(`version:${name}:${graphHash}`)
    return v ? { graph: v.graph, source: v.source } : null
  }

  async getAIGeneratedWorkflows(
    _agentName?: string
  ): Promise<Array<{ workflowName: string; graphHash: string; graph: any }>> {
    // v0.1: cross-run query — needs an external index. For per-run DO
    // there's no useful answer here.
    return []
  }

  // ─── Transport hooks (overriding queue-based defaults) ────────────

  protected override async dispatchStep(
    runId: string,
    stepName: string,
    rpcName: string,
    data: unknown,
    stepOptions?: WorkflowStepOptions
  ): Promise<boolean> {
    if (this.isInline(runId)) return false
    const stub = await this.getStepStub(rpcName)
    if (!stub) return false

    await stub.run({
      runId,
      stepName,
      rpcName,
      data,
      retries: stepOptions?.retries,
      retryDelay: stepOptions?.retryDelay,
    })
    return true
  }

  /**
   * Resolve the step worker stub for a given rpcName. Default looks up
   * `env[toStepBindingName(rpcName)]` (e.g. `env['enrich-card']`) — the
   * convention used by the deploy pipeline when emitting per-step service
   * bindings on the orchestrator unit.
   *
   * Override to use a dispatch-namespace lookup or any other resolution
   * strategy. Returning `null` causes `dispatchStep` to fall through and
   * the step is skipped — useful for inline-only test envs.
   */
  protected async getStepStub(rpcName: string): Promise<PikkuStepStub | null> {
    const key = toStepBindingName(rpcName)
    const stub = (this.env as Record<string, unknown>)[key] as
      | PikkuStepStub
      | undefined
    return stub ?? null
  }

  protected override async scheduleSleep(
    runId: string,
    stepId: string,
    duration: number | string
  ): Promise<boolean> {
    if (this.isInline(runId)) return false
    const ms =
      typeof duration === 'number' ? duration : parseDurationMs(duration)
    await this.storage.put<DoPendingAlarm>(KEY_ALARM_NEXT, {
      kind: 'sleep',
      stepId,
    })
    await this.storage.setAlarm(Date.now() + ms)
    return true
  }

  /**
   * Override of base class — instead of enqueuing an orchestrator job,
   * just call `runWorkflowJob` directly (we are already in the DO; the
   * caller is the same DO instance). For delayed retries, set an alarm.
   */
  override async resumeWorkflow(
    runId: string,
    _workflowName?: string
  ): Promise<void> {
    // Direct resume — caller (e.g. step-worker callback) wants us to
    // continue the workflow now. Schedule via alarm to detach from the
    // current call stack and pick up on the next tick.
    await this.storage.put<DoPendingAlarm>(KEY_ALARM_NEXT, {
      kind: 'orchestrator-retry',
    })
    await this.storage.setAlarm(Date.now() + 1)
  }

  protected override async scheduleOrchestratorRetry(
    _runId: string,
    retryDelay?: number | string,
    _workflowName?: string
  ): Promise<void> {
    const ms =
      retryDelay == null
        ? 1
        : typeof retryDelay === 'number'
          ? retryDelay
          : parseDurationMs(retryDelay)
    await this.storage.put<DoPendingAlarm>(KEY_ALARM_NEXT, {
      kind: 'orchestrator-retry',
    })
    await this.storage.setAlarm(Date.now() + ms)
  }

  override async queueStepWorker(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any
  ): Promise<void> {
    // Direct hand-off — same path as dispatchStep. Used by some callers
    // outside the rpcStep flow (e.g. workflow.queue() pattern).
    const stub = await this.getStepStub(rpcName)
    if (!stub) {
      throw new Error(
        `No step worker binding for rpcName=${rpcName} (looked up env['${toStepBindingName(rpcName)}'])`
      )
    }
    await stub.run({ runId, stepName, rpcName, data })
  }

  // ─── Internals ────────────────────────────────────────────────────

  protected assertOwn(runId: string): void {
    if (runId !== this.ownRunId) {
      throw new Error(
        `Cross-run access denied: this DO owns runId=${this.ownRunId}, got ${runId}`
      )
    }
  }

  protected async updateStep(
    stepId: string,
    mutate: (s: DoStepRecord) => void
  ): Promise<DoStepRecord> {
    const key = stepKey(stepId)
    const step = await this.storage.get<DoStepRecord>(key)
    if (!step) {
      throw new Error(`Step record not found: ${stepId}`)
    }
    mutate(step)
    step.updatedAt = Date.now()
    await this.storage.put(key, step)
    return step
  }

  protected async appendHistory(
    stepId: string,
    status: StepStatus,
    result?: unknown,
    error?: SerializedError
  ): Promise<void> {
    const historyId = crypto.randomUUID()
    const record: DoStepHistoryRecord = {
      historyId,
      stepId,
      status,
      result,
      error: error ?? null,
      createdAt: Date.now(),
    }
    await this.storage.put(historyKey(historyId), record)
    const order = (await this.storage.get<string[]>(KEY_HISTORY_ORDER)) ?? []
    order.push(historyId)
    await this.storage.put(KEY_HISTORY_ORDER, order)
  }

  /**
   * Read and clear the pending alarm reason. Called by the DO host class
   * from its `alarm()` method to dispatch correctly.
   */
  async consumePendingAlarm(): Promise<DoPendingAlarm | null> {
    const pending = await this.storage.get<DoPendingAlarm>(KEY_ALARM_NEXT)
    if (pending) await this.storage.delete(KEY_ALARM_NEXT)
    return pending ?? null
  }

  async setRetentionAlarm(retentionMs: number): Promise<void> {
    await this.storage.put<DoPendingAlarm>(KEY_ALARM_NEXT, {
      kind: 'retention',
    })
    await this.storage.setAlarm(Date.now() + retentionMs)
  }
}

// ─── helpers ────────────────────────────────────────────────────────

function toWorkflowRun(r: DoRunRecord): WorkflowRun {
  return {
    ...r,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  }
}

function toStepState(s: DoStepRecord): StepState & { stepName: string } {
  return {
    stepId: s.stepId,
    stepName: s.stepName,
    status: s.status,
    result: s.result,
    error: s.error,
    attemptCount: s.attemptCount,
    retries: s.retries,
    retryDelay: s.retryDelay,
    childRunId: s.childRunId,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    runningAt: s.runningAt ? new Date(s.runningAt) : undefined,
    scheduledAt: s.scheduledAt ? new Date(s.scheduledAt) : undefined,
    succeededAt: s.succeededAt ? new Date(s.succeededAt) : undefined,
    failedAt: s.failedAt ? new Date(s.failedAt) : undefined,
  }
}

function parseDurationMs(d: string | number): number {
  if (typeof d === 'number') return d
  // Accept simple "Ns" / "Nm" / "Nh" / "Nd" or raw ms numeric string.
  const m = /^\s*(\d+)\s*(ms|s|m|h|d)?\s*$/.exec(d)
  if (!m) return Number(d) || 0
  const n = Number(m[1])
  switch (m[2]) {
    case 'd':
      return n * 86_400_000
    case 'h':
      return n * 3_600_000
    case 'm':
      return n * 60_000
    case 's':
      return n * 1_000
    case 'ms':
    default:
      return n
  }
}
