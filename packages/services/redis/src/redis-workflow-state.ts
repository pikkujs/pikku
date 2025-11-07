import type { SerializedError } from '@pikku/core'
import {
  WorkflowStateService,
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
 * const workflowState = new RedisWorkflowStateService(redis, queueService, 'workflows')
 * await workflowState.init()
 * ```
 */
export class RedisWorkflowStateService extends WorkflowStateService {
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

  private lockKey(runId: string): string {
    return `${this.keyPrefix}:lock:${runId}`
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

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    const key = this.stepKey(runId, stepName)
    const data = await this.redis.hgetall(key)

    // If no row exists or status is failed, create a new pending row
    if (!data.status || data.status === 'failed') {
      const now = Date.now()
      const stepId = `${runId}:${stepName}:${now}`

      await this.redis.hmset(
        key,
        'stepId',
        stepId,
        'status',
        'pending',
        'attemptCount',
        '1',
        'createdAt',
        now.toString(),
        'updatedAt',
        now.toString()
      )

      return {
        stepId,
        status: 'pending',
        attemptCount: 1,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      }
    }

    return {
      stepId: data.stepId!,
      status: data.status as any,
      result: data.result ? JSON.parse(data.result) : undefined,
      error: data.error ? JSON.parse(data.error) : undefined,
      attemptCount: Number(data.attemptCount || 1),
      createdAt: new Date(Number(data.createdAt!)),
      updatedAt: new Date(Number(data.updatedAt!)),
    }
  }

  async setStepScheduled(stepId: string): Promise<void> {
    // Extract runId and stepName from stepId (format: runId:stepName:timestamp)
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')

    const now = Date.now()
    const key = this.stepKey(runId, stepName)

    await this.redis.hmset(
      key,
      'status',
      'scheduled',
      'updatedAt',
      now.toString()
    )
  }

  async setStepResult(stepId: string, result: any): Promise<void> {
    // Extract runId and stepName from stepId (format: runId:stepName:timestamp)
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')

    const now = Date.now()
    const key = this.stepKey(runId, stepName)

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
  }

  async setStepError(stepId: string, error: Error): Promise<void> {
    // Extract runId and stepName from stepId (format: runId:stepName:timestamp)
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')

    const now = Date.now()
    const key = this.stepKey(runId, stepName)

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
  }

  async withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = this.lockKey(id)
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

    throw new Error(
      `Failed to acquire lock for run ${id} after ${maxRetries} retries`
    )
  }

  async createRetryAttempt(stepId: string): Promise<StepState> {
    // Extract runId and stepName from stepId (format: runId:stepName:timestamp)
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')

    const now = Date.now()
    const key = this.stepKey(runId, stepName)

    // Get current attempt count
    const currentAttempt = Number(
      (await this.redis.hget(key, 'attemptCount')) || 1
    )
    const newAttemptCount = currentAttempt + 1

    // Reset step to pending for retry (keeps result/error for visibility)
    await this.redis.hmset(
      key,
      'status',
      'pending',
      'attemptCount',
      newAttemptCount.toString(),
      'updatedAt',
      now.toString()
    )

    // Get updated state
    const data = await this.redis.hgetall(key)

    return {
      stepId: data.stepId!,
      status: 'pending',
      result: data.result ? JSON.parse(data.result) : undefined,
      error: data.error ? JSON.parse(data.error) : undefined,
      attemptCount: newAttemptCount,
      createdAt: new Date(Number(data.createdAt!)),
      updatedAt: new Date(now),
    }
  }

  async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.redis.quit()
    }
  }
}
