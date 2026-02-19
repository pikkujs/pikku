import type {
  WorkflowRun,
  StepState,
  WorkflowStatus,
  WorkflowRunService,
} from '@pikku/core/workflow'
import type { Redis } from 'ioredis'

export class RedisWorkflowRunService implements WorkflowRunService {
  constructor(
    private redis: Redis,
    private keyPrefix = 'workflows'
  ) {}

  private runKey(runId: string): string {
    return `${this.keyPrefix}:run:${runId}`
  }

  private stepKeyPattern(runId: string): string {
    return `${this.keyPrefix}:step:${runId}:*`
  }

  private stepHistoryKey(stepId: string): string {
    return `${this.keyPrefix}:step-history:${stepId}`
  }

  private versionKey(name: string, graphHash: string): string {
    return `${this.keyPrefix}:version:${name}:${graphHash}`
  }

  async listRuns(options?: {
    workflowName?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<WorkflowRun[]> {
    const { workflowName, status, limit = 50, offset = 0 } = options ?? {}

    const runKeys = await this.scanKeys(`${this.keyPrefix}:run:*`)

    const runs: WorkflowRun[] = []
    for (const key of runKeys) {
      const data = await this.redis.hgetall(key)
      if (!data.id) continue

      if (workflowName && data.workflow !== workflowName) continue
      if (status && data.status !== status) continue

      runs.push(this.mapRunData(data))
    }

    runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return runs.slice(offset, offset + limit)
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const data = await this.redis.hgetall(this.runKey(id))
    if (!data.id) return null
    return this.mapRunData(data)
  }

  async getRunSteps(
    runId: string
  ): Promise<
    Array<StepState & { stepName: string; rpcName?: string; data?: any }>
  > {
    const stepKeys = await this.scanKeys(this.stepKeyPattern(runId))

    const steps: Array<
      StepState & { stepName: string; rpcName?: string; data?: any }
    > = []

    for (const key of stepKeys) {
      const data = await this.redis.hgetall(key)
      if (!data.stepId) continue

      steps.push({
        stepId: data.stepId,
        stepName: this.extractStepName(key, runId),
        rpcName: data.rpcName || undefined,
        data: data.data ? JSON.parse(data.data) : undefined,
        status: data.status as any,
        result: data.result ? JSON.parse(data.result) : undefined,
        error: data.error ? JSON.parse(data.error) : undefined,
        attemptCount: Number(data.attemptCount || 1),
        retries: data.retries ? Number(data.retries) : undefined,
        retryDelay: data.retryDelay || undefined,
        createdAt: new Date(Number(data.createdAt)),
        updatedAt: new Date(Number(data.updatedAt)),
      })
    }

    steps.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    return steps
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    const stepKeys = await this.scanKeys(this.stepKeyPattern(runId))

    const allHistoryEntries: Array<StepState & { stepName: string }> = []

    for (const key of stepKeys) {
      const data = await this.redis.hgetall(key)
      if (!data.stepId) continue

      const historyEntries = await this.redis.zrange(
        this.stepHistoryKey(data.stepId),
        0,
        -1
      )

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
          updatedAt: new Date(entry.createdAt),
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

    return allHistoryEntries.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )
  }

  async getDistinctWorkflowNames(): Promise<string[]> {
    const runKeys = await this.scanKeys(`${this.keyPrefix}:run:*`)

    const names = new Set<string>()
    for (const key of runKeys) {
      const workflow = await this.redis.hget(key, 'workflow')
      if (workflow) names.add(workflow)
    }

    return [...names].sort()
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    const data = await this.redis.hgetall(this.versionKey(name, graphHash))
    if (!data.graph) return null
    return {
      graph: JSON.parse(data.graph),
      source: data.source!,
    }
  }

  async deleteRun(id: string): Promise<boolean> {
    const exists = await this.redis.exists(this.runKey(id))
    if (!exists) return false

    const stepKeys = await this.scanKeys(this.stepKeyPattern(id))

    const keysToDelete = [this.runKey(id)]

    for (const stepKey of stepKeys) {
      const stepId = await this.redis.hget(stepKey, 'stepId')
      keysToDelete.push(stepKey)
      if (stepId) {
        keysToDelete.push(this.stepHistoryKey(stepId))
      }
    }

    await this.redis.del(...keysToDelete)
    return true
  }

  private mapRunData(data: Record<string, string>): WorkflowRun {
    return {
      id: data.id!,
      workflow: data.workflow!,
      status: data.status! as WorkflowStatus,
      input: JSON.parse(data.input!),
      output: data.output ? JSON.parse(data.output) : undefined,
      error: data.error ? JSON.parse(data.error) : undefined,
      inline: data.inline === 'true' ? true : undefined,
      graphHash: data.graphHash || undefined,
      createdAt: new Date(Number(data.createdAt!)),
      updatedAt: new Date(Number(data.updatedAt!)),
    }
  }

  private extractStepName(key: string, runId: string): string {
    const prefix = `${this.keyPrefix}:step:${runId}:`
    return key.slice(prefix.length)
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = []
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
      keys.push(...foundKeys)
    } while (cursor !== '0')
    return keys
  }
}
