import { RedisWorkflowRunService } from './redis-workflow-run-service.js'
import type { SerializedError } from '@pikku/core/errors'
import {
  DRIVEN_RUN_STATUSES,
  DEFAULT_STEP_LEASE_MS,
  isStepLeaseLive,
  PikkuWorkflowService,
} from '@pikku/core/workflow'
import type {
  WorkflowPlannedStep,
  WorkflowServiceOptions,
  WorkflowRun,
  WorkflowRunWire,
  StepState,
  StepStatus,
  WorkflowStatus,
  WorkflowVersionStatus,
  WorkflowRpcStepOptions,
} from '@pikku/core/workflow'
import { Redis, type RedisOptions } from 'ioredis'
import { randomUUID } from 'crypto'
import { drivenRunsKey, findDrivenRunIds } from './redis-driven-runs.js'

/**
 * Writes a step only while it is in a status that may precede the write and,
 * with an attempt, still on that attempt. KEYS[1] is the step hash; ARGV is the
 * stepId, the attempt (empty when unfenced), the number of such statuses, the
 * statuses, the number of fields to clear, those fields, then field/value pairs
 * to set. Returns the attempt the step was on, or -1 when nothing was written.
 */
const CONDITIONAL_STEP_WRITE = `
local stepId = redis.call('HGET', KEYS[1], 'stepId')
local status = redis.call('HGET', KEYS[1], 'status')
local current = tonumber(redis.call('HGET', KEYS[1], 'attemptCount') or '1')
if stepId ~= ARGV[1] or (ARGV[2] ~= '' and current ~= tonumber(ARGV[2])) then
  return -1
end
local sources = tonumber(ARGV[3])
local allowed = false
for i = 4, sources + 3 do
  if ARGV[i] == status then
    allowed = true
  end
end
if not allowed then
  return -1
end
local clears = tonumber(ARGV[sources + 4])
for i = sources + 5, sources + 4 + clears do
  redis.call('HDEL', KEYS[1], ARGV[i])
end
for i = sources + 5 + clears, #ARGV, 2 do
  redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1])
end
return current
`

/**
 * Renews or releases the lease of a `running` or `cancelling` step. ARGV is the stepId, the
 * attempt (empty when unfenced), and the new expiry in epoch milliseconds
 * (empty to release). Returns 1 when the lease moved.
 */
const FENCED_LEASE_REFRESH = `
local stepId = redis.call('HGET', KEYS[1], 'stepId')
local status = redis.call('HGET', KEYS[1], 'status')
if stepId ~= ARGV[1] or (status ~= 'running' and status ~= 'cancelling') then
  return 0
end
local current = tonumber(redis.call('HGET', KEYS[1], 'attemptCount') or '1')
if ARGV[2] ~= '' and current ~= tonumber(ARGV[2]) then
  return 0
end
if ARGV[3] == '' then
  redis.call('HDEL', KEYS[1], 'leaseExpiresAt')
else
  redis.call('HSET', KEYS[1], 'leaseExpiresAt', ARGV[3])
end
return 1
`

/**
 * Takes back a lost step as a new attempt, only while it is still `running` on
 * the attempt the claim read, its lease is still lapsed and no child run has
 * been saved on it; otherwise nothing is written. KEYS[1] is the step hash; ARGV is the stepId, that
 * attempt, the new attempt, the new lease expiry and the time, both in epoch
 * milliseconds. Returns 1 when the step was taken.
 */
const ATOMIC_STEP_RECLAIM = `
local current = tonumber(redis.call('HGET', KEYS[1], 'attemptCount') or '1')
local lease = tonumber(redis.call('HGET', KEYS[1], 'leaseExpiresAt') or '')
if redis.call('HGET', KEYS[1], 'stepId') ~= ARGV[1]
  or not lease
  or lease >= tonumber(ARGV[5])
  or redis.call('HGET', KEYS[1], 'status') ~= 'running'
  or current ~= tonumber(ARGV[2])
  or redis.call('HEXISTS', KEYS[1], 'childRunId') == 1 then
  return 0
end
redis.call('HSET', KEYS[1], 'attemptCount', ARGV[3])
redis.call('HSET', KEYS[1], 'leaseExpiresAt', ARGV[4])
redis.call('HSET', KEYS[1], 'updatedAt', ARGV[5])
return 1
`

/**
 * Takes a step under a fresh lease, only while it is on the attempt the claim
 * read and in one of the named statuses; a `running` or `cancelling` one only
 * once its lease has lapsed and with no child run. KEYS[1] is the step hash; ARGV is the stepId, the
 * attempt, the new lease expiry and the time, both in epoch milliseconds, then
 * the statuses. Returns 1 when the step was taken.
 */
const ATOMIC_STEP_CLAIM = `
local status = redis.call('HGET', KEYS[1], 'status')
local current = tonumber(redis.call('HGET', KEYS[1], 'attemptCount') or '1')
if redis.call('HGET', KEYS[1], 'stepId') ~= ARGV[1]
  or current ~= tonumber(ARGV[2]) then
  return 0
end
local allowed = false
for i = 5, #ARGV do
  if ARGV[i] == status then
    allowed = true
  end
end
if not allowed then
  return 0
end
if status == 'running' or status == 'cancelling' then
  local lease = tonumber(redis.call('HGET', KEYS[1], 'leaseExpiresAt') or '')
  if not lease or lease >= tonumber(ARGV[4])
    or redis.call('HEXISTS', KEYS[1], 'childRunId') == 1 then
    return 0
  end
end
redis.call('HSET', KEYS[1], 'status', 'running')
redis.call('HSET', KEYS[1], 'leaseExpiresAt', ARGV[3])
redis.call('HSET', KEYS[1], 'updatedAt', ARGV[4])
return 1
`

/**
 * Moves a run only while its status is one that may precede the new one, and
 * keeps the index of driven runs in step. KEYS are the run hash and that index;
 * ARGV is the run id, the index score (empty when the new status is not a driven
 * one), the number of preceding statuses, those statuses, then field/value pairs
 * to set. Returns 1 when the run moved.
 */
const CONDITIONAL_RUN_WRITE = `
local current = redis.call('HGET', KEYS[1], 'status')
local sources = tonumber(ARGV[3])
local allowed = false
for i = 4, sources + 3 do
  if ARGV[i] == current then
    allowed = true
  end
end
if not allowed then
  return 0
end
for i = sources + 4, #ARGV, 2 do
  redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1])
end
if ARGV[2] == '' then
  redis.call('ZREM', KEYS[2], ARGV[1])
else
  redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
end
return 1
`

/**
 * Redis-based implementation of WorkflowStateService
 *
 * Stores workflow run state and step state in Redis. Runs and steps are locked
 * on the app's `leaseService`, which need not be Redis-backed.
 *
 * @example
 * ```typescript
 * const redis = new Redis('redis://localhost:6379')
 * const leaseService = new RedisLeaseService(redis)
 * const workflowService = new RedisWorkflowService(redis, { leaseService })
 * ```
 */
export class RedisWorkflowService extends PikkuWorkflowService {
  private redis: Redis
  private keyPrefix: string
  private ownsConnection: boolean

  /**
   * @param connectionOrConfig - ioredis Redis instance, RedisOptions config, or connection string
   * @param options.keyPrefix - Redis key prefix (default: 'workflows')
   * @param options.leaseService - the app's lease service, which locks runs and steps
   */
  constructor(
    connectionOrConfig: Redis | RedisOptions | string | undefined,
    {
      keyPrefix = 'workflows',
      ...options
    }: WorkflowServiceOptions & {
      keyPrefix?: string
    }
  ) {
    super(options)
    this.keyPrefix = keyPrefix

    // An already-connected client is recognised by the commands it exposes
    // rather than by `instanceof Redis`, so a compatible client that is not an
    // ioredis subclass — a test double, a wrapper — is used as given instead of
    // being silently ignored in favour of a fresh connection to localhost.
    if (
      typeof connectionOrConfig === 'object' &&
      connectionOrConfig !== null &&
      'hgetall' in connectionOrConfig &&
      'hset' in connectionOrConfig
    ) {
      this.redis = connectionOrConfig as Redis
      this.ownsConnection = false
    } else {
      this.redis = new Redis(connectionOrConfig as any)
      this.ownsConnection = true
    }
  }

  /**
   * Initialize the service (no-op for Redis, always ready)
   */
  public async init(): Promise<void> {
    // Redis doesn't require schema initialization
    await this.redis.ping()
  }

  private runKey(runId: string): string {
    return `${this.keyPrefix}:run:${runId}`
  }

  private stepKey(runId: string, stepName: string): string {
    return `${this.keyPrefix}:step:${runId}:${stepName}`
  }

  private stepHistoryKey(stepId: string): string {
    return `${this.keyPrefix}:step-history:${stepId}`
  }

  /**
   * Save a step history entry (creates new entry)
   */
  private async saveStepHistory(
    stepId: string,
    stepName: string,
    attemptCount: number,
    status: StepStatus,
    result?: any,
    error?: SerializedError,
    retries?: number,
    retryDelay?: string
  ): Promise<void> {
    const historyKey = this.stepHistoryKey(stepId)
    const now = Date.now()

    const entry: any = {
      stepId,
      stepName,
      attemptCount,
      status,
      result: result !== undefined ? JSON.stringify(result) : undefined,
      error: error !== undefined ? JSON.stringify(error) : undefined,
      retries,
      retryDelay,
      createdAt: now,
    }

    // Add status-specific timestamp
    switch (status) {
      case 'running':
        entry.runningAt = now
        break
      case 'scheduled':
        entry.scheduledAt = now
        break
      case 'succeeded':
        entry.succeededAt = now
        break
      case 'failed':
        entry.failedAt = now
        break
    }

    // Remove undefined fields
    Object.keys(entry).forEach(
      (key) => entry[key] === undefined && delete entry[key]
    )

    // Store in sorted set with attemptCount as score for ordering
    await this.redis.zadd(historyKey, attemptCount, JSON.stringify(entry))
  }

  /**
   * Update the current history entry in-place (for state transitions within same attempt)
   */
  private async updateCurrentHistoryRecord(
    stepId: string,
    stepName: string,
    attemptCount: number,
    status: Exclude<StepStatus, 'pending' | 'suspended' | 'cancelled'>,
    result?: any,
    error?: SerializedError,
    retries?: number,
    retryDelay?: string
  ): Promise<void> {
    const historyKey = this.stepHistoryKey(stepId)

    // Get current history entry for this attempt
    const historyEntries = await this.redis.zrangebyscore(
      historyKey,
      attemptCount,
      attemptCount
    )

    if (historyEntries.length === 0) {
      // No existing entry - this shouldn't happen, but create one if missing
      await this.saveStepHistory(
        stepId,
        stepName,
        attemptCount,
        status,
        result,
        error,
        retries,
        retryDelay
      )
      return
    }

    // Parse existing entry
    const existingEntry = JSON.parse(historyEntries[0]!)
    const now = Date.now()

    // Update the entry with new status and keep original createdAt
    const updatedEntry: any = {
      ...existingEntry,
      status,
      result: result !== undefined ? JSON.stringify(result) : undefined,
      error: error !== undefined ? JSON.stringify(error) : undefined,
    }

    // Add status-specific timestamp
    switch (status) {
      case 'running':
        updatedEntry.runningAt = now
        break
      case 'scheduled':
        updatedEntry.scheduledAt = now
        break
      case 'succeeded':
        updatedEntry.succeededAt = now
        break
      case 'failed':
        updatedEntry.failedAt = now
        break
    }

    // Remove old entry and add updated one (Redis sorted set will replace if score is same)
    await this.redis.zremrangebyscore(historyKey, attemptCount, attemptCount)
    await this.redis.zadd(
      historyKey,
      attemptCount,
      JSON.stringify(updatedEntry)
    )
  }

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
    const id = randomUUID()
    const now = Date.now()

    const key = this.runKey(id)

    await this.redis.hmset(
      key,
      'id',
      id,
      'workflow',
      workflowName,
      'status',
      'running',
      'input',
      JSON.stringify(input),
      'inline',
      inline ? 'true' : 'false',
      'graphHash',
      graphHash,
      'deterministic',
      options?.deterministic ? 'true' : 'false',
      'plannedSteps',
      options?.plannedSteps ? JSON.stringify(options.plannedSteps) : '',
      'wire',
      JSON.stringify(wire),
      'createdAt',
      now.toString(),
      'updatedAt',
      now.toString()
    )

    return id
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const key = this.runKey(id)
    const data = await this.redis.hgetall(key)

    if (!data.id) {
      return null
    }

    return {
      id: data.id!,
      workflow: data.workflow!,
      status: data.status! as WorkflowStatus,
      input: JSON.parse(data.input!),
      output: data.output ? JSON.parse(data.output) : undefined,
      error: data.error ? JSON.parse(data.error) : undefined,
      inline: data.inline === 'true' ? true : undefined,
      graphHash: data.graphHash || undefined,
      deterministic: data.deterministic === 'true' ? true : undefined,
      plannedSteps: data.plannedSteps
        ? JSON.parse(data.plannedSteps)
        : undefined,
      wire: data.wire ? JSON.parse(data.wire) : { type: 'unknown' },
      createdAt: new Date(Number(data.createdAt!)),
      updatedAt: new Date(Number(data.updatedAt!)),
    }
  }

  protected async transitionRunStatusImpl(
    id: string,
    from: readonly WorkflowStatus[],
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<boolean> {
    const now = Date.now()
    const key = this.runKey(id)

    const fields: Record<string, string> = {
      status,
      updatedAt: now.toString(),
    }

    if (output !== undefined) {
      fields.output = JSON.stringify(output)
    }

    if (error !== undefined) {
      fields.error = JSON.stringify(error)
    }

    const moved = await this.redis.eval(
      CONDITIONAL_RUN_WRITE,
      2,
      key,
      drivenRunsKey(this.keyPrefix),
      id,
      DRIVEN_RUN_STATUSES.includes(status) ? now.toString() : '',
      from.length.toString(),
      ...from,
      ...Object.entries(fields).flat()
    )
    return Number(moved) === 1
  }

  protected override findRunsAwaitingDriver(
    before: Date,
    limit: number,
    offset: number
  ): Promise<string[]> {
    return findDrivenRunIds(this.redis, this.keyPrefix, before, limit, offset)
  }

  protected async insertStepStateImpl(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: WorkflowRpcStepOptions,
    fromStepName?: string
  ): Promise<StepState> {
    const now = Date.now()
    const stepId = `${runId}:${stepName}:${now}`
    const key = this.stepKey(runId, stepName)

    const fields: Record<string, string> = {
      stepId,
      data: JSON.stringify(data),
      status: 'pending',
      attemptCount: '1',
      createdAt: now.toString(),
      updatedAt: now.toString(),
    }

    if (rpcName !== null) {
      fields.rpcName = rpcName
    }

    if (stepOptions?.retries !== undefined) {
      fields.retries = stepOptions.retries.toString()
    }

    if (stepOptions?.retryDelay !== undefined) {
      fields.retryDelay = stepOptions.retryDelay.toString()
    }

    if (stepOptions?.timeout !== undefined) {
      fields.timeout = stepOptions.timeout.toString()
    }

    if (fromStepName !== undefined) {
      fields.fromStepName = fromStepName
    }

    await this.redis.hmset(key, fields)

    // Save initial history entry
    await this.saveStepHistory(
      stepId,
      stepName,
      1,
      'pending',
      undefined,
      undefined,
      stepOptions?.retries,
      stepOptions?.retryDelay?.toString()
    )

    return {
      stepId,
      status: 'pending',
      rpcName,
      attemptCount: 1,
      retries: stepOptions?.retries,
      retryDelay:
        stepOptions?.retryDelay !== undefined
          ? stepOptions.retryDelay.toString()
          : undefined,
      timeout: stepOptions?.timeout?.toString(),
      fromStepName,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    const key = this.stepKey(runId, stepName)
    const data = await this.redis.hgetall(key)

    if (!data.stepId) {
      throw new Error(
        `Step not found: runId=${runId}, stepName=${stepName}. Use insertStepState to create it.`
      )
    }

    return {
      stepId: data.stepId,
      status: data.status as any,
      rpcName: data.rpcName ?? null,
      result: data.result ? JSON.parse(data.result) : undefined,
      error: data.error ? JSON.parse(data.error) : undefined,
      attemptCount: Number(data.attemptCount || 1),
      retries: data.retries ? Number(data.retries) : undefined,
      retryDelay: data.retryDelay,
      timeout: data.timeout || undefined,
      fromStepName: data.fromStepName || undefined,
      childRunId: data.childRunId || undefined,
      leaseExpiresAt: data.leaseExpiresAt
        ? new Date(Number(data.leaseExpiresAt))
        : undefined,
      createdAt: new Date(Number(data.createdAt!)),
      updatedAt: new Date(Number(data.updatedAt!)),
    }
  }

  async getRunSteps(
    runId: string
  ): Promise<
    Array<StepState & { stepName: string; rpcName?: string; data?: any }>
  > {
    return new RedisWorkflowRunService(this.redis, this.keyPrefix).getRunSteps(
      runId
    )
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    // Find all step keys for this run to get their stepIds
    const pattern = `${this.keyPrefix}:step:${runId}:*`
    const stepKeys: string[] = []

    // Use SCAN to find all step keys for this run
    let cursor = '0'
    do {
      const [newCursor, foundKeys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      )
      cursor = newCursor
      stepKeys.push(...foundKeys)
    } while (cursor !== '0')

    // Fetch all history entries for all steps
    const allHistoryEntries: Array<StepState & { stepName: string }> = []

    for (const stepKey of stepKeys) {
      const stepData = await this.redis.hgetall(stepKey)
      if (!stepData.stepId) continue

      const stepId = stepData.stepId
      const historyKey = this.stepHistoryKey(stepId)

      // Get all history entries for this step (sorted by attemptCount)
      const historyEntries = await this.redis.zrange(historyKey, 0, '-1')

      for (const entryStr of historyEntries) {
        const entry = JSON.parse(entryStr)

        allHistoryEntries.push({
          stepId: entry.stepId,
          stepName: entry.stepName,
          // Provenance lives on the step row, not the per-attempt history entry.
          fromStepName: stepData.fromStepName || undefined,
          status: entry.status,
          result: entry.result ? JSON.parse(entry.result) : undefined,
          error: entry.error ? JSON.parse(entry.error) : undefined,
          attemptCount: entry.attemptCount,
          retries: entry.retries,
          retryDelay: entry.retryDelay,
          createdAt: new Date(entry.createdAt),
          updatedAt: new Date(entry.createdAt), // Use createdAt for both
          runningAt: entry.runningAt ? new Date(entry.runningAt) : undefined,
          scheduledAt: entry.scheduledAt
            ? new Date(entry.scheduledAt)
            : undefined,
          succeededAt: entry.succeededAt
            ? new Date(entry.succeededAt)
            : undefined,
          failedAt: entry.failedAt ? new Date(entry.failedAt) : undefined,
        })
      }
    }

    // Sort all entries by creation time (oldest first)
    return allHistoryEntries.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )
  }

  protected async setStepRunningImpl(
    stepId: string,
    from: readonly StepStatus[],
    attempt?: number
  ): Promise<boolean> {
    return this.moveStep(stepId, 'running', from, attempt)
  }

  protected async setStepCancellingImpl(
    stepId: string,
    from: readonly StepStatus[],
    attempt: number
  ): Promise<boolean> {
    return this.moveStep(stepId, 'cancelling', from, attempt)
  }

  protected async setStepScheduledImpl(
    stepId: string,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    return this.moveStep(stepId, 'scheduled', from)
  }

  /**
   * `CONDITIONAL_STEP_WRITE` on the step `stepId` names. Resolves the attempt
   * written, or `null` when nothing was.
   */
  private async writeStepIf(
    stepId: string,
    from: readonly StepStatus[],
    fields: Record<string, string>,
    attempt?: number,
    clear: string[] = []
  ): Promise<number | null> {
    const { runId, stepName } = this.parseStepId(stepId)
    const written = Number(
      await this.redis.eval(
        CONDITIONAL_STEP_WRITE,
        1,
        this.stepKey(runId, stepName),
        stepId,
        attempt?.toString() ?? '',
        from.length.toString(),
        ...from,
        clear.length.toString(),
        ...clear,
        ...Object.entries({
          ...fields,
          updatedAt: Date.now().toString(),
        }).flat()
      )
    )
    return written === -1 ? null : written
  }

  /** Move a step and its current history attempt to a status in flight. */
  private async moveStep(
    stepId: string,
    status: 'running' | 'scheduled' | 'cancelling',
    from: readonly StepStatus[],
    attempt?: number
  ): Promise<boolean> {
    const written = await this.writeStepIf(stepId, from, { status }, attempt)
    if (written === null) return false
    await this.updateStepHistory(stepId, written, status)
    return true
  }

  private async updateStepHistory(
    stepId: string,
    attempt: number,
    status: Exclude<StepStatus, 'pending' | 'suspended' | 'cancelled'>,
    result?: any,
    error?: SerializedError
  ): Promise<void> {
    const { runId, stepName } = this.parseStepId(stepId)
    const [retries, retryDelay] = await this.redis.hmget(
      this.stepKey(runId, stepName),
      'retries',
      'retryDelay'
    )
    await this.updateCurrentHistoryRecord(
      stepId,
      stepName,
      attempt,
      status,
      result,
      error,
      retries ? Number(retries) : undefined,
      retryDelay ?? undefined
    )
  }

  protected async setStepChildRunIdImpl(
    stepId: string,
    childRunId: string,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    return (await this.writeStepIf(stepId, from, { childRunId })) !== null
  }

  public override async refreshStepLease(
    stepId: string,
    leaseMs: number | null,
    attempt?: number
  ): Promise<boolean> {
    const { runId, stepName } = this.parseStepId(stepId)
    const moved = await this.redis.eval(
      FENCED_LEASE_REFRESH,
      1,
      this.stepKey(runId, stepName),
      stepId,
      attempt?.toString() ?? '',
      leaseMs === null ? '' : (Date.now() + leaseMs).toString()
    )
    return Number(moved) === 1
  }

  protected async setStepResultImpl(
    stepId: string,
    result: any,
    attempt: number | undefined,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    const written = await this.writeStepIf(
      stepId,
      from,
      { status: 'succeeded', result: JSON.stringify(result) },
      attempt,
      ['error']
    )
    if (written === null) return false
    await this.updateStepHistory(stepId, written, 'succeeded', result)
    return true
  }

  protected async setStepErrorImpl(
    stepId: string,
    error: Error,
    attempt: number | undefined,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }
    const written = await this.writeStepIf(
      stepId,
      from,
      { status: 'failed', error: JSON.stringify(serializedError) },
      attempt,
      ['result']
    )
    if (written === null) return false
    await this.updateStepHistory(
      stepId,
      written,
      'failed',
      undefined,
      serializedError
    )
    return true
  }

  /** A stepId is `runId:stepName:timestamp`, and a step name may hold colons. */
  private parseStepId(stepId: string): { runId: string; stepName: string } {
    const parts = stepId.split(':')
    return { runId: parts[0]!, stepName: parts.slice(1, -1).join(':') }
  }

  protected async createRetryAttemptImpl(
    stepId: string,
    status: 'pending' | 'running',
    from: readonly StepStatus[],
    attempt?: number
  ): Promise<StepState | null> {
    // TODO: If status is 'running', we need to set the running_at timestamp in history

    // Extract runId and stepName from stepId (format: runId:stepName:timestamp)
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')

    const now = Date.now()
    const key = this.stepKey(runId, stepName)

    // Get current attempt count and retries config
    const data = await this.redis.hgetall(key)
    const currentAttempt = attempt ?? Number(data.attemptCount || 1)
    const newAttemptCount = currentAttempt + 1
    const retries = data.retries ? Number(data.retries) : undefined
    const retryDelay = data.retryDelay

    // Fenced to the attempt being retried, so of two retries of it one applies.
    // Keeps result/error for visibility. A `running` attempt takes a fresh lease
    // in the same write: under the previous attempt's lapsed one, another claim
    // could take it before `refreshStepLease` runs.
    const written = await this.writeStepIf(
      stepId,
      from,
      {
        status,
        attemptCount: newAttemptCount.toString(),
        ...(status === 'running'
          ? { leaseExpiresAt: (now + DEFAULT_STEP_LEASE_MS).toString() }
          : {}),
      },
      currentAttempt,
      ['childRunId']
    )
    if (written === null) return null

    // Insert NEW history record for retry attempt
    await this.saveStepHistory(
      stepId,
      stepName,
      newAttemptCount,
      'pending',
      undefined,
      undefined,
      retries,
      retryDelay
    )

    return {
      stepId: data.stepId!,
      status: 'pending',
      rpcName: data.rpcName ?? null,
      result: data.result ? JSON.parse(data.result) : undefined,
      error: data.error ? JSON.parse(data.error) : undefined,
      attemptCount: newAttemptCount,
      retries: retries,
      retryDelay: retryDelay,
      timeout: data.timeout || undefined,
      fromStepName: data.fromStepName || undefined,
      createdAt: new Date(Number(data.createdAt!)),
      updatedAt: new Date(now),
    }
  }

  /**
   * A `running` step is decided on this one read: it belongs to its child or
   * its lease holder, or it is lost and taken back by `ATOMIC_STEP_RECLAIM`.
   * Reading and then resetting it would delete a child saved in between, and a
   * second one would be started. Everything else is the engine's own claim.
   */
  protected override async claimStepForExecution(
    runId: string,
    stepName: string,
    rpcName: string,
    leaseMs: number
  ): Promise<StepState | null> {
    const seen = await this.getStepState(runId, stepName)
    if (seen.status === 'running' && seen.rpcName === rpcName) {
      if (seen.childRunId || isStepLeaseLive(seen.leaseExpiresAt)) {
        return null
      }
      if (await this.settleUnclaimableStep(runId, stepName, seen, leaseMs)) {
        return null
      }
      return this.reclaimLostStep(runId, stepName, seen, leaseMs)
    }
    return super.claimStepForExecution(runId, stepName, rpcName, leaseMs)
  }

  private async reclaimLostStep(
    runId: string,
    stepName: string,
    seen: StepState,
    leaseMs: number
  ): Promise<StepState | null> {
    const attempt = seen.attemptCount + 1
    const claimed = await this.mirrored(
      async () => {
        const now = Date.now()
        const taken = await this.redis.eval(
          ATOMIC_STEP_RECLAIM,
          1,
          this.stepKey(runId, stepName),
          seen.stepId,
          seen.attemptCount.toString(),
          attempt.toString(),
          (now + leaseMs).toString(),
          now.toString()
        )
        if (Number(taken) !== 1) return null
        await this.saveStepHistory(
          seen.stepId,
          stepName,
          attempt,
          'running',
          undefined,
          undefined,
          seen.retries,
          seen.retryDelay?.toString()
        )
        return {
          ...seen,
          attemptCount: attempt,
          leaseExpiresAt: new Date(now + leaseMs),
          updatedAt: new Date(now),
        }
      },
      async (mirror, newStep) => {
        if (newStep) {
          await mirror.createRetryAttempt(seen.stepId, {
            ...newStep,
            stepName,
          })
        }
      }
    )
    if (!claimed) return null
    await this.logStepRerun(runId, stepName, claimed.attemptCount)
    return { ...claimed, lapsedAttempt: seen.attemptCount }
  }

  protected async claimStepStatus(
    seen: StepState,
    from: readonly StepStatus[],
    leaseMs: number
  ): Promise<boolean> {
    const { runId, stepName } = this.parseStepId(seen.stepId)
    const now = Date.now()
    const taken = await this.redis.eval(
      ATOMIC_STEP_CLAIM,
      1,
      this.stepKey(runId, stepName),
      seen.stepId,
      seen.attemptCount.toString(),
      (now + leaseMs).toString(),
      now.toString(),
      ...from
    )
    return Number(taken) === 1
  }

  // ============================================================================
  // Workflow Graph Methods
  // ============================================================================

  async getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    failedNodeIds: string[]
    branchKeys: Record<string, string>
  }> {
    const completedNodeIds: string[] = []
    const failedNodeIds: string[] = []
    const branchKeys: Record<string, string> = {}

    const pattern = `${this.keyPrefix}:step:${runId}:*`
    let cursor = '0'

    do {
      const [newCursor, foundKeys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      )
      cursor = newCursor

      for (const key of foundKeys) {
        const data = await this.redis.hmget(
          key,
          'status',
          'branchTaken',
          'attemptCount',
          'retries'
        )
        const [status, branchTaken, attemptCount, retries] = data

        const parts = key.split(':')
        const stepIndex = parts.lastIndexOf('step')
        if (stepIndex === -1 || stepIndex + 1 >= parts.length) continue
        if (parts[stepIndex + 1] !== runId) continue
        const nodeId = parts.slice(stepIndex + 2).join(':')

        if (status === 'succeeded') {
          completedNodeIds.push(nodeId)
          if (branchTaken) {
            branchKeys[nodeId] = branchTaken
          }
        } else if (status === 'failed') {
          const maxAttempts = (parseInt(retries || '0', 10) || 0) + 1
          const attempts = parseInt(attemptCount || '0', 10) || 0
          if (attempts >= maxAttempts) {
            failedNodeIds.push(nodeId)
          }
        }
      }
    } while (cursor !== '0')

    return { completedNodeIds, failedNodeIds, branchKeys }
  }

  async getStepInstances(runId: string): Promise<
    Array<{
      stepName: string
      status: StepStatus
      fromStepName?: string
      leaseExpiresAt?: Date
    }>
  > {
    const instances: Array<{
      stepName: string
      status: StepStatus
      fromStepName?: string
      leaseExpiresAt?: Date
    }> = []
    const pattern = `${this.keyPrefix}:step:${runId}:*`
    let cursor = '0'
    do {
      const [newCursor, foundKeys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      )
      cursor = newCursor
      for (const key of foundKeys) {
        const [status, fromStepName, leaseExpiresAt] = await this.redis.hmget(
          key,
          'status',
          'fromStepName',
          'leaseExpiresAt'
        )
        const parts = key.split(':')
        const stepIndex = parts.lastIndexOf('step')
        if (stepIndex === -1 || parts[stepIndex + 1] !== runId) continue
        instances.push({
          stepName: parts.slice(stepIndex + 2).join(':'),
          status: status as StepStatus,
          fromStepName: fromStepName || undefined,
          leaseExpiresAt: leaseExpiresAt
            ? new Date(Number(leaseExpiresAt))
            : undefined,
        })
      }
    } while (cursor !== '0')
    return instances
  }

  async getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>> {
    if (nodeIds.length === 0) return {}

    const results: Record<string, any> = {}

    for (const nodeId of nodeIds) {
      const key = this.stepKey(runId, nodeId)
      const data = await this.redis.hmget(key, 'status', 'result')
      const [status, result] = data

      if (status === 'succeeded' && result) {
        results[nodeId] = JSON.parse(result)
      }
    }

    return results
  }

  protected async setBranchTakenImpl(
    stepId: string,
    branchKey: string,
    from: readonly StepStatus[]
  ): Promise<boolean> {
    return (
      (await this.writeStepIf(stepId, from, { branchTaken: branchKey })) !==
      null
    )
  }

  /**
   * Hash holding one field per state variable of a run.
   *
   * The whole state used to be a single JSON blob on the run hash, which made
   * every write a read-modify-write: two parallel branches each setting their
   * own variable would both read the blob, add their key, and write it back,
   * so whichever wrote second silently dropped the other's variable.
   */
  private runStateKey(runId: string): string {
    return `${this.keyPrefix}:run-state:${runId}`
  }

  protected async updateRunStateImpl(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    // HSET touches only the field it is named, so concurrent writers to
    // different variables no longer race, and nothing has to parse and
    // re-encode the values it is not writing.
    await this.redis.hset(
      this.runStateKey(runId),
      name,
      JSON.stringify(value) ?? 'null'
    )
    await this.redis.hset(
      this.runKey(runId),
      'updatedAt',
      Date.now().toString()
    )
  }

  async getRunState(runId: string): Promise<Record<string, unknown>> {
    // The blob is what a run started before the per-key layout still holds; a
    // field written since wins, so a run in flight across the deploy keeps
    // everything it had.
    const blob = await this.redis.hget(this.runKey(runId), 'state')
    const state: Record<string, unknown> = blob ? JSON.parse(blob) : {}

    const fields = await this.redis.hgetall(this.runStateKey(runId))
    for (const [name, value] of Object.entries(fields)) {
      state[name] = JSON.parse(value)
    }
    return state
  }

  private versionKey(name: string, graphHash: string): string {
    return `${this.keyPrefix}:version:${name}:${graphHash}`
  }

  protected async upsertWorkflowVersionImpl(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void> {
    const key = this.versionKey(name, graphHash)
    const exists = await this.redis.exists(key)
    if (!exists) {
      await this.redis.hmset(
        key,
        'workflowName',
        name,
        'graphHash',
        graphHash,
        'graph',
        JSON.stringify(graph),
        'source',
        source,
        'status',
        status ?? 'active',
        'createdAt',
        Date.now().toString()
      )
    }
  }

  protected async updateWorkflowVersionStatusImpl(
    name: string,
    graphHash: string,
    status: WorkflowVersionStatus
  ): Promise<void> {
    const key = this.versionKey(name, graphHash)
    await this.redis.hset(key, 'status', status)
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    const key = this.versionKey(name, graphHash)
    const data = await this.redis.hgetall(key)
    if (!data.graph) return null
    return {
      graph: JSON.parse(data.graph),
      source: data.source!,
    }
  }

  async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.redis.quit()
    }
  }
}
