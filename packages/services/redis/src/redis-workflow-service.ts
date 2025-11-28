import type { SerializedError } from '@pikku/core'
import {
  PikkuWorkflowService,
  type WorkflowRun,
  type StepState,
  type WorkflowStatus,
} from '@pikku/core/workflow'
import { Redis, type RedisOptions } from 'ioredis'
import { randomUUID } from 'crypto'

/**
 * Redis-based implementation of WorkflowStateService
 *
 * Stores workflow run state and step state in Redis with row-level locking.
 *
 * @example
 * ```typescript
 * const redis = new Redis('redis://localhost:6379')
 * const workflowService = new RedisWorkflowService(redis, 'workflows')
 * ```
 */
export class RedisWorkflowService extends PikkuWorkflowService {
  private redis: Redis
  private keyPrefix: string
  private ownsConnection: boolean
  private lockTTL = 30000 // Lock TTL in milliseconds (30 seconds)

  /**
   * @param connectionOrConfig - ioredis Redis instance, RedisOptions config, or connection string
   * @param keyPrefix - Redis key prefix (default: 'workflows')
   */
  constructor(
    connectionOrConfig: Redis | RedisOptions | string | undefined,
    keyPrefix = 'workflows'
  ) {
    super()
    this.keyPrefix = keyPrefix

    // Check if it's a Redis instance or config options
    if (connectionOrConfig instanceof Redis) {
      this.redis = connectionOrConfig
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

  private lockKey(runId: string): string {
    return `${this.keyPrefix}:lock:${runId}`
  }

  private stepLockKey(runId: string, stepName: string): string {
    return `${this.keyPrefix}:step-lock:${runId}:${stepName}`
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

  async createRun(workflowName: string, input: any): Promise<string> {
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
      createdAt: new Date(Number(data.createdAt!)),
      updatedAt: new Date(Number(data.updatedAt!)),
    }
  }

  async updateRunStatus(
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

  async insertStepState(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    stepOptions?: { retries?: number; retryDelay?: string | number }
  ): Promise<StepState> {
    const now = Date.now()
    const stepId = `${runId}:${stepName}:${now}`
    const key = this.stepKey(runId, stepName)

    const fields: Record<string, string> = {
      stepId,
      rpcName,
      data: JSON.stringify(data),
      status: 'pending',
      attemptCount: '1',
      createdAt: now.toString(),
      updatedAt: now.toString(),
    }

    if (stepOptions?.retries !== undefined) {
      fields.retries = stepOptions.retries.toString()
    }

    if (stepOptions?.retryDelay !== undefined) {
      fields.retryDelay = stepOptions.retryDelay.toString()
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
      attemptCount: 1,
      retries: stepOptions?.retries,
      retryDelay:
        stepOptions?.retryDelay !== undefined
          ? stepOptions.retryDelay.toString()
          : undefined,
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
      result: data.result ? JSON.parse(data.result) : undefined,
      error: data.error ? JSON.parse(data.error) : undefined,
      attemptCount: Number(data.attemptCount || 1),
      retries: data.retries ? Number(data.retries) : undefined,
      retryDelay: data.retryDelay,
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
      const historyEntries = await this.redis.zrange(historyKey, 0, -1)

      for (const entryStr of historyEntries) {
        const entry = JSON.parse(entryStr)

        allHistoryEntries.push({
          stepId: entry.stepId,
          stepName: entry.stepName,
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

  async setStepRunning(stepId: string): Promise<void> {
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

  async setStepScheduled(stepId: string): Promise<void> {
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

  async setStepResult(stepId: string, result: any): Promise<void> {
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
      'succeeded',
      'result',
      JSON.stringify(result),
      'updatedAt',
      now.toString()
    )

    // Remove error field if it exists
    await this.redis.hdel(key, 'error')

    // Update current history record to succeeded (update in-place)
    await this.updateCurrentHistoryRecord(
      stepId,
      stepName,
      attemptCount,
      'succeeded',
      result,
      undefined,
      retries,
      retryDelay
    )
  }

  async setStepError(stepId: string, error: Error): Promise<void> {
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

    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }

    await this.redis.hmset(
      key,
      'status',
      'failed',
      'error',
      JSON.stringify(serializedError),
      'updatedAt',
      now.toString()
    )

    // Remove result field if it exists
    await this.redis.hdel(key, 'result')

    // Update current history record to failed (update in-place)
    await this.updateCurrentHistoryRecord(
      stepId,
      stepName,
      attemptCount,
      'failed',
      undefined,
      serializedError,
      retries,
      retryDelay
    )
  }

  private async withLock<T>(
    lockKey: string,
    errorMessage: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const lockValue = randomUUID()
    const maxRetries = 10
    const retryDelay = 100 // ms

    // Try to acquire lock with retries
    for (let i = 0; i < maxRetries; i++) {
      const acquired = await this.redis.set(
        lockKey,
        lockValue,
        'PX',
        this.lockTTL,
        'NX'
      )

      if (acquired === 'OK') {
        try {
          // Lock acquired, execute function
          return await fn()
        } finally {
          // Release lock using Lua script to ensure we only delete our own lock
          await this.redis.eval(
            `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
            1,
            lockKey,
            lockValue
          )
        }
      }

      // Lock not acquired, wait and retry
      await new Promise((resolve) => setTimeout(resolve, retryDelay))
    }

    throw new Error(`${errorMessage} after ${maxRetries} retries`)
  }

  async withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return this.withLock(
      this.lockKey(id),
      `Failed to acquire lock for run ${id}`,
      fn
    )
  }

  async withStepLock<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return this.withLock(
      this.stepLockKey(runId, stepName),
      `Failed to acquire step lock for run ${runId}, step ${stepName}`,
      fn
    )
  }

  async createRetryAttempt(
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
      result: data.result ? JSON.parse(data.result) : undefined,
      error: data.error ? JSON.parse(data.error) : undefined,
      attemptCount: newAttemptCount,
      retries: retries,
      retryDelay: retryDelay,
      createdAt: new Date(Number(data.createdAt!)),
      updatedAt: new Date(now),
    }
  }

  // ============================================================================
  // Workflow Graph Methods
  // ============================================================================

  async getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    branchKeys: Record<string, string>
  }> {
    const completedNodeIds: string[] = []
    const branchKeys: Record<string, string> = {}

    // Scan for step keys with 'node:' prefix
    const pattern = `${this.keyPrefix}:step:${runId}:node:*`
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

      // Check each key for succeeded status and branch_taken
      for (const key of foundKeys) {
        const data = await this.redis.hmget(key, 'status', 'branchTaken')
        const [status, branchTaken] = data

        if (status === 'succeeded') {
          // Extract node ID from key: workflows:step:runId:node:nodeId
          const parts = key.split(':')
          const nodeIndex = parts.indexOf('node')
          if (nodeIndex !== -1 && nodeIndex < parts.length - 1) {
            const nodeId = parts.slice(nodeIndex + 1).join(':')
            completedNodeIds.push(nodeId)

            if (branchTaken) {
              branchKeys[nodeId] = branchTaken
            }
          }
        }
      }
    } while (cursor !== '0')

    return { completedNodeIds, branchKeys }
  }

  async getNodesWithoutSteps(
    runId: string,
    nodeIds: string[]
  ): Promise<string[]> {
    if (nodeIds.length === 0) return []

    const result: string[] = []

    for (const nodeId of nodeIds) {
      const key = this.stepKey(runId, `node:${nodeId}`)
      const exists = await this.redis.exists(key)
      if (!exists) {
        result.push(nodeId)
      }
    }

    return result
  }

  async getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>> {
    if (nodeIds.length === 0) return {}

    const results: Record<string, any> = {}

    for (const nodeId of nodeIds) {
      const key = this.stepKey(runId, `node:${nodeId}`)
      const data = await this.redis.hmget(key, 'status', 'result')
      const [status, result] = data

      if (status === 'succeeded' && result) {
        results[nodeId] = JSON.parse(result)
      }
    }

    return results
  }

  async setBranchTaken(stepId: string, branchKey: string): Promise<void> {
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

  async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.redis.quit()
    }
  }
}
