import type { SerializedError } from '@pikku/core/errors'
import {
  PikkuWorkflowService,
  WorkflowStepSupersededError,
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
} from '@pikku/core/workflow'
import { Redis, type RedisOptions } from 'ioredis'
import { randomUUID } from 'crypto'

/**
 * Writes a step's outcome only while it is still the attempt that wrote it.
 * KEYS[1] is the step hash; ARGV is the stepId, the attempt (empty for an
 * unfenced write), the field to clear, then field/value pairs to set.
 * Returns the step's attempt, or -1 when a newer claim owns it.
 */
const FENCED_STEP_WRITE = `
local stepId = redis.call('HGET', KEYS[1], 'stepId')
local current = tonumber(redis.call('HGET', KEYS[1], 'attemptCount') or '1')
if ARGV[2] ~= '' and (stepId ~= ARGV[1] or current ~= tonumber(ARGV[2])) then
  return -1
end
redis.call('HDEL', KEYS[1], ARGV[3])
for i = 4, #ARGV, 2 do
  redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1])
end
return current
`

/**
 * Renews or releases a step's lease, fenced like `FENCED_STEP_WRITE`. ARGV is
 * the stepId, the attempt (empty when unfenced), and the new expiry in epoch
 * milliseconds (empty to release). Returns 1 when the lease moved.
 */
const FENCED_LEASE_REFRESH = `
local stepId = redis.call('HGET', KEYS[1], 'stepId')
if stepId ~= ARGV[1] then
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
    status: 'pending' | 'running' | 'scheduled' | 'succeeded' | 'failed',
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
    status: 'running' | 'scheduled' | 'succeeded' | 'failed',
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

  protected async updateRunStatusImpl(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
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

    await this.redis.hmset(key, fields)
  }

  protected async insertStepStateImpl(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: { retries?: number; retryDelay?: string | number },
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
      fromStepName: data.fromStepName || undefined,
      leaseExpiresAt: data.leaseExpiresAt
        ? new Date(Number(data.leaseExpiresAt))
        : undefined,
      createdAt: new Date(Number(data.createdAt!)),
      updatedAt: new Date(Number(data.updatedAt!)),
    }
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

  protected async setStepRunningImpl(stepId: string): Promise<void> {
    // Extract runId and stepName from stepId (format: runId:stepName:timestamp)
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')

    const now = Date.now()
    const key = this.stepKey(runId, stepName)

    // Get current attempt count and retries config
    const data = await this.redis.hgetall(key)
    const attemptCount = Number(data.attemptCount || 1)
    const retries = data.retries ? Number(data.retries) : undefined
    const retryDelay = data.retryDelay

    await this.redis.hmset(
      key,
      'status',
      'running',
      'updatedAt',
      now.toString()
    )

    // Update current history record to running (update in-place)
    await this.updateCurrentHistoryRecord(
      stepId,
      stepName,
      attemptCount,
      'running',
      undefined,
      undefined,
      retries,
      retryDelay
    )
  }

  protected async setStepScheduledImpl(stepId: string): Promise<void> {
    // Extract runId and stepName from stepId (format: runId:stepName:timestamp)
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')

    const now = Date.now()
    const key = this.stepKey(runId, stepName)

    // Get current attempt count and retries config
    const data = await this.redis.hgetall(key)
    const attemptCount = Number(data.attemptCount || 1)
    const retries = data.retries ? Number(data.retries) : undefined
    const retryDelay = data.retryDelay

    await this.redis.hmset(
      key,
      'status',
      'scheduled',
      'updatedAt',
      now.toString()
    )

    // Update current history record to scheduled (update in-place)
    await this.updateCurrentHistoryRecord(
      stepId,
      stepName,
      attemptCount,
      'scheduled',
      undefined,
      undefined,
      retries,
      retryDelay
    )
  }

  protected async setStepChildRunIdImpl(
    stepId: string,
    childRunId: string
  ): Promise<void> {
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')
    const key = this.stepKey(runId, stepName)
    await this.redis.hmset(
      key,
      'childRunId',
      childRunId,
      'updatedAt',
      Date.now().toString()
    )
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
    attempt?: number
  ): Promise<void> {
    await this.writeStepOutcome(stepId, 'succeeded', attempt, result)
  }

  protected async setStepErrorImpl(
    stepId: string,
    error: Error,
    attempt?: number
  ): Promise<void> {
    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }
    await this.writeStepOutcome(
      stepId,
      'failed',
      attempt,
      undefined,
      serializedError
    )
  }

  /**
   * Record a step's outcome and its current history attempt. With `attempt`,
   * a step claimed again since throws `WorkflowStepSupersededError` and keeps
   * the newer claim's state.
   */
  private async writeStepOutcome(
    stepId: string,
    status: 'succeeded' | 'failed',
    attempt: number | undefined,
    result?: any,
    error?: SerializedError
  ): Promise<void> {
    const { runId, stepName } = this.parseStepId(stepId)
    const key = this.stepKey(runId, stepName)
    const outcome =
      status === 'succeeded'
        ? ['result', JSON.stringify(result)]
        : ['error', JSON.stringify(error)]

    const written = Number(
      await this.redis.eval(
        FENCED_STEP_WRITE,
        1,
        key,
        stepId,
        attempt?.toString() ?? '',
        status === 'succeeded' ? 'error' : 'result',
        'status',
        status,
        ...outcome,
        'updatedAt',
        Date.now().toString()
      )
    )
    if (written === -1) {
      throw new WorkflowStepSupersededError(stepId, attempt!)
    }

    const [retries, retryDelay] = await this.redis.hmget(
      key,
      'retries',
      'retryDelay'
    )
    await this.updateCurrentHistoryRecord(
      stepId,
      stepName,
      written,
      status,
      result,
      error,
      retries ? Number(retries) : undefined,
      retryDelay ?? undefined
    )
  }

  /** A stepId is `runId:stepName:timestamp`, and a step name may hold colons. */
  private parseStepId(stepId: string): { runId: string; stepName: string } {
    const parts = stepId.split(':')
    return { runId: parts[0]!, stepName: parts.slice(1, -1).join(':') }
  }

  protected async createRetryAttemptImpl(
    stepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState> {
    // TODO: If status is 'running', we need to set the running_at timestamp in history

    // Extract runId and stepName from stepId (format: runId:stepName:timestamp)
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')

    const now = Date.now()
    const key = this.stepKey(runId, stepName)

    // Get current attempt count and retries config
    const data = await this.redis.hgetall(key)
    const currentAttempt = Number(data.attemptCount || 1)
    const newAttemptCount = currentAttempt + 1
    const retries = data.retries ? Number(data.retries) : undefined
    const retryDelay = data.retryDelay

    // Reset step to pending for retry (keeps result/error for visibility)
    await this.redis.hmset(
      key,
      'status',
      status,
      'attemptCount',
      newAttemptCount.toString(),
      'updatedAt',
      now.toString()
    )

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
      fromStepName: data.fromStepName || undefined,
      createdAt: new Date(Number(data.createdAt!)),
      updatedAt: new Date(now),
    }
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
    branchKey: string
  ): Promise<void> {
    // Extract runId and stepName from stepId (format: runId:stepName:timestamp)
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')

    const now = Date.now()
    const key = this.stepKey(runId, stepName)

    await this.redis.hmset(
      key,
      'branchTaken',
      branchKey,
      'updatedAt',
      now.toString()
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
