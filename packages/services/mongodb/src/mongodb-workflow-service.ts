import type { SerializedError } from '@pikku/core'
import {
  PikkuWorkflowService,
  type WorkflowRun,
  type WorkflowRunWire,
  type StepState,
  type WorkflowStatus,
  type WorkflowVersionStatus,
} from '@pikku/core/workflow'
import type { Db, Collection } from 'mongodb'
import { MongoDBWorkflowRunService } from './mongodb-workflow-run-service.js'

interface WorkflowRunDoc {
  _id: string
  workflow: string
  status: string
  input: any
  output: any | null
  error: any | null
  state: Record<string, unknown>
  inline: boolean
  graphHash: string | null
  wire: any | null
  createdAt: Date
  updatedAt: Date
}

interface WorkflowStepDoc {
  _id: string
  workflowRunId: string
  stepName: string
  rpcName: string | null
  data: any | null
  status: string
  result: any | null
  error: any | null
  branchTaken: string | null
  retries: number | null
  retryDelay: string | null
  createdAt: Date
  updatedAt: Date
}

interface WorkflowStepHistoryDoc {
  _id: string
  workflowStepId: string
  status: string
  result: any | null
  error: any | null
  createdAt: Date
  runningAt: Date | null
  scheduledAt: Date | null
  succeededAt: Date | null
  failedAt: Date | null
}

interface WorkflowVersionDoc {
  workflowName: string
  graphHash: string
  graph: any
  source: string
  status: string
  createdAt: Date
}

export class MongoDBWorkflowService extends PikkuWorkflowService {
  private initialized = false
  private runService: MongoDBWorkflowRunService
  private runs: Collection<WorkflowRunDoc>
  private steps: Collection<WorkflowStepDoc>
  private stepHistory: Collection<WorkflowStepHistoryDoc>
  private versions: Collection<WorkflowVersionDoc>

  constructor(db: Db) {
    super()
    this.runService = new MongoDBWorkflowRunService(db)
    this.runs = db.collection<WorkflowRunDoc>('workflow_runs')
    this.steps = db.collection<WorkflowStepDoc>('workflow_step')
    this.stepHistory = db.collection<WorkflowStepHistoryDoc>(
      'workflow_step_history'
    )
    this.versions = db.collection<WorkflowVersionDoc>('workflow_versions')
  }

  public async init(): Promise<void> {
    if (this.initialized) return

    await this.runs.createIndex({ workflow: 1 })
    await this.runs.createIndex({ status: 1 })
    await this.runs.createIndex({ createdAt: -1 })

    await this.steps.createIndex(
      { workflowRunId: 1, stepName: 1 },
      { unique: true }
    )
    await this.steps.createIndex({ workflowRunId: 1 })

    await this.stepHistory.createIndex({ workflowStepId: 1 })
    await this.stepHistory.createIndex({ createdAt: 1 })

    await this.versions.createIndex(
      { workflowName: 1, graphHash: 1 },
      { unique: true }
    )

    this.initialized = true
  }

  async createRun(
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire
  ): Promise<string> {
    const id = crypto.randomUUID()
    const now = new Date()

    await this.runs.insertOne({
      _id: id,
      workflow: workflowName,
      status: 'running',
      input,
      output: null,
      error: null,
      state: {},
      inline,
      graphHash,
      wire,
      createdAt: now,
      updatedAt: now,
    })

    return id
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    return this.runService.getRun(id)
  }

  async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    await this.runs.updateOne(
      { _id: id },
      {
        $set: {
          status,
          output: output ?? null,
          error: error ?? null,
          updatedAt: new Date(),
        },
      }
    )
  }

  async insertStepState(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: { retries?: number; retryDelay?: string | number }
  ): Promise<StepState> {
    const stepId = crypto.randomUUID()
    const now = new Date()

    await this.steps.insertOne({
      _id: stepId,
      workflowRunId: runId,
      stepName,
      rpcName,
      data: data ?? null,
      status: 'pending',
      result: null,
      error: null,
      branchTaken: null,
      retries: stepOptions?.retries ?? null,
      retryDelay: stepOptions?.retryDelay?.toString() ?? null,
      createdAt: now,
      updatedAt: now,
    })

    await this.insertHistoryRecord(stepId, 'pending')

    return {
      stepId,
      status: 'pending',
      result: undefined,
      error: undefined,
      attemptCount: 1,
      retries: stepOptions?.retries,
      retryDelay: stepOptions?.retryDelay?.toString(),
      createdAt: now,
      updatedAt: now,
    }
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    const row = await this.steps.findOne({
      workflowRunId: runId,
      stepName,
    })

    if (!row) {
      throw new Error(
        `Step not found: runId=${runId}, stepName=${stepName}. Use insertStepState to create it.`
      )
    }

    const attemptCount = await this.stepHistory.countDocuments({
      workflowStepId: row._id,
    })

    return {
      stepId: row._id,
      status: row.status as StepState['status'],
      result: row.result ?? undefined,
      error: row.error ?? undefined,
      attemptCount,
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retryDelay ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    return this.runService.getRunHistory(runId)
  }

  async setStepRunning(stepId: string): Promise<void> {
    await this.steps.updateOne(
      { _id: stepId },
      { $set: { status: 'running', updatedAt: new Date() } }
    )

    const latestHistory = await this.stepHistory
      .find({ workflowStepId: stepId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray()

    if (latestHistory.length > 0) {
      await this.stepHistory.updateOne(
        { _id: latestHistory[0]!._id },
        { $set: { status: 'running' } }
      )
    }
  }

  async setStepScheduled(stepId: string): Promise<void> {
    await this.steps.updateOne(
      { _id: stepId },
      { $set: { status: 'scheduled', updatedAt: new Date() } }
    )
  }

  private async insertHistoryRecord(
    stepId: string,
    status: string,
    result?: any,
    error?: SerializedError
  ): Promise<void> {
    const now = new Date()
    const doc: any = {
      _id: crypto.randomUUID(),
      workflowStepId: stepId,
      status,
      result: result ?? null,
      error: error ?? null,
      createdAt: now,
      runningAt: null,
      scheduledAt: null,
      succeededAt: null,
      failedAt: null,
    }

    const timestampField = this.getTimestampFieldForStatus(status)
    if (timestampField !== 'createdAt') {
      doc[timestampField] = now
    }

    await this.stepHistory.insertOne(doc)
  }

  private getTimestampFieldForStatus(status: string): string {
    switch (status) {
      case 'running':
        return 'runningAt'
      case 'scheduled':
        return 'scheduledAt'
      case 'succeeded':
        return 'succeededAt'
      case 'failed':
        return 'failedAt'
      default:
        return 'createdAt'
    }
  }

  async setStepResult(stepId: string, result: any): Promise<void> {
    await this.steps.updateOne(
      { _id: stepId },
      {
        $set: {
          status: 'succeeded',
          result,
          error: null,
          updatedAt: new Date(),
        },
      }
    )

    const latestHistory = await this.stepHistory
      .find({ workflowStepId: stepId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray()

    if (latestHistory.length > 0) {
      await this.stepHistory.updateOne(
        { _id: latestHistory[0]!._id },
        { $set: { status: 'succeeded', result } }
      )
    }
  }

  async setStepError(stepId: string, error: Error): Promise<void> {
    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }

    await this.steps.updateOne(
      { _id: stepId },
      {
        $set: {
          status: 'failed',
          error: serializedError,
          result: null,
          updatedAt: new Date(),
        },
      }
    )

    const latestHistory = await this.stepHistory
      .find({ workflowStepId: stepId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray()

    if (latestHistory.length > 0) {
      await this.stepHistory.updateOne(
        { _id: latestHistory[0]!._id },
        { $set: { status: 'failed', error: serializedError } }
      )
    }
  }

  async createRetryAttempt(
    stepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState> {
    await this.steps.updateOne(
      { _id: stepId },
      {
        $set: {
          status,
          result: null,
          error: null,
          updatedAt: new Date(),
        },
      }
    )

    await this.insertHistoryRecord(stepId, status)

    const row = await this.steps.findOne({ _id: stepId })
    if (!row) throw new Error(`Step not found: ${stepId}`)

    const attemptCount = await this.stepHistory.countDocuments({
      workflowStepId: stepId,
    })

    return {
      stepId: row._id,
      status: row.status as StepState['status'],
      result: row.result ?? undefined,
      error: row.error ?? undefined,
      attemptCount,
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retryDelay ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }

  async withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  async withStepLock<T>(
    _runId: string,
    _stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return fn()
  }

  async getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    failedNodeIds: string[]
    branchKeys: Record<string, string>
  }> {
    const results = await this.steps
      .find({
        workflowRunId: runId,
        status: { $in: ['succeeded', 'failed'] },
      })
      .toArray()

    const completedNodeIds: string[] = []
    const failedNodeIds: string[] = []
    const branchKeys: Record<string, string> = {}

    for (const row of results) {
      const nodeId = row.stepName

      if (row.status === 'succeeded') {
        completedNodeIds.push(nodeId)
        if (row.branchTaken) {
          branchKeys[nodeId] = row.branchTaken
        }
      } else if (row.status === 'failed') {
        const maxAttempts = (row.retries ?? 0) + 1
        const attemptCount = await this.stepHistory.countDocuments({
          workflowStepId: row._id,
        })
        if (attemptCount >= maxAttempts) {
          failedNodeIds.push(nodeId)
        }
      }
    }

    return { completedNodeIds, failedNodeIds, branchKeys }
  }

  async getNodesWithoutSteps(
    runId: string,
    nodeIds: string[]
  ): Promise<string[]> {
    if (nodeIds.length === 0) return []

    const result = await this.steps
      .find({
        workflowRunId: runId,
        stepName: { $in: nodeIds },
      })
      .project({ stepName: 1 })
      .toArray()

    const existingStepNames = new Set(result.map((r) => r.stepName))
    return nodeIds.filter((id) => !existingStepNames.has(id))
  }

  async getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>> {
    if (nodeIds.length === 0) return {}

    const result = await this.steps
      .find({
        workflowRunId: runId,
        stepName: { $in: nodeIds },
        status: 'succeeded',
      })
      .toArray()

    const results: Record<string, any> = {}
    for (const row of result) {
      results[row.stepName] = row.result
    }
    return results
  }

  async setBranchTaken(stepId: string, branchKey: string): Promise<void> {
    await this.steps.updateOne(
      { _id: stepId },
      { $set: { branchTaken: branchKey, updatedAt: new Date() } }
    )
  }

  async updateRunState(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    await this.runs.updateOne(
      { _id: runId },
      {
        $set: {
          [`state.${name}`]: value,
          updatedAt: new Date(),
        },
      }
    )
  }

  async getRunState(runId: string): Promise<Record<string, unknown>> {
    const row = await this.runs.findOne(
      { _id: runId },
      { projection: { state: 1 } }
    )
    if (!row) return {}
    return row.state ?? {}
  }

  async upsertWorkflowVersion(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void> {
    await this.versions.updateOne(
      { workflowName: name, graphHash },
      {
        $setOnInsert: {
          workflowName: name,
          graphHash,
          graph,
          source,
          status: status ?? 'active',
          createdAt: new Date(),
        },
      },
      { upsert: true }
    )
  }

  async updateWorkflowVersionStatus(
    name: string,
    graphHash: string,
    status: WorkflowVersionStatus
  ): Promise<void> {
    await this.versions.updateOne(
      { workflowName: name, graphHash },
      { $set: { status } }
    )
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    return this.runService.getWorkflowVersion(name, graphHash)
  }

  async getAIGeneratedWorkflows(
    agentName?: string
  ): Promise<Array<{ workflowName: string; graphHash: string; graph: any }>> {
    const filter: Record<string, any> = { source: 'ai-agent', status: 'active' }
    if (agentName) {
      const escaped = agentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.workflowName = { $regex: `^ai:${escaped}:` }
    }
    const docs = await this.versions.find(filter).toArray()
    return docs.map((doc) => ({
      workflowName: doc.workflowName,
      graphHash: doc.graphHash,
      graph: doc.graph,
    }))
  }

  async close(): Promise<void> {}
}
