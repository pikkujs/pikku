import type {
  WorkflowPlannedStep,
  WorkflowRun,
  StepState,
  WorkflowStatus,
  WorkflowRunService,
} from '@pikku/core/workflow'
import type { Db, Collection } from 'mongodb'

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
  deterministic?: boolean
  plannedSteps?: WorkflowPlannedStep[]
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
  createdAt: Date
}

export class MongoDBWorkflowRunService implements WorkflowRunService {
  private runs: Collection<WorkflowRunDoc>
  private steps: Collection<WorkflowStepDoc>
  private stepHistory: Collection<WorkflowStepHistoryDoc>
  private versions: Collection<WorkflowVersionDoc>

  constructor(db: Db) {
    this.runs = db.collection<WorkflowRunDoc>('workflow_runs')
    this.steps = db.collection<WorkflowStepDoc>('workflow_step')
    this.stepHistory = db.collection<WorkflowStepHistoryDoc>(
      'workflow_step_history'
    )
    this.versions = db.collection<WorkflowVersionDoc>('workflow_versions')
  }

  async listRuns(options?: {
    workflowName?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<WorkflowRun[]> {
    const { workflowName, status, limit = 50, offset = 0 } = options ?? {}

    const filter: Record<string, any> = {}
    if (workflowName) filter.workflow = workflowName
    if (status) filter.status = status

    const result = await this.runs
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray()

    return result.map((row) => this.mapRunRow(row))
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const row = await this.runs.findOne({ _id: id })
    if (!row) return null
    return this.mapRunRow(row)
  }

  async getRunSteps(
    runId: string
  ): Promise<
    Array<StepState & { stepName: string; rpcName?: string; data?: any }>
  > {
    const result = await this.steps
      .find({ workflowRunId: runId })
      .sort({ createdAt: 1 })
      .toArray()

    const stepIds = result.map((r) => r._id)
    const historyCounts = await this.stepHistory
      .aggregate<{
        _id: string
        count: number
      }>([
        { $match: { workflowStepId: { $in: stepIds } } },
        { $group: { _id: '$workflowStepId', count: { $sum: 1 } } },
      ])
      .toArray()

    const countMap = new Map(historyCounts.map((h) => [h._id, h.count]))

    return result.map((row) => ({
      stepId: row._id,
      stepName: row.stepName,
      rpcName: row.rpcName ?? undefined,
      data: row.data ?? undefined,
      status: row.status as StepState['status'],
      result: row.result ?? undefined,
      error: row.error ?? undefined,
      attemptCount: countMap.get(row._id) ?? 1,
      retries: row.retries != null ? Number(row.retries) : undefined,
      retryDelay: row.retryDelay ?? undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }))
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    const steps = await this.steps.find({ workflowRunId: runId }).toArray()

    const stepMap = new Map(steps.map((s) => [s._id, s]))
    const stepIds = steps.map((s) => s._id)

    const history = await this.stepHistory
      .find({ workflowStepId: { $in: stepIds } })
      .sort({ createdAt: 1 })
      .toArray()

    let attemptCounters: Record<string, number> = {}
    return history.map((row) => {
      const stepId = row.workflowStepId
      const step = stepMap.get(stepId)!
      attemptCounters[stepId] = (attemptCounters[stepId] ?? 0) + 1

      return {
        stepId,
        stepName: step.stepName,
        status: row.status as StepState['status'],
        result: row.result ?? undefined,
        error: row.error ?? undefined,
        attemptCount: attemptCounters[stepId]!,
        retries: step.retries != null ? Number(step.retries) : undefined,
        retryDelay: step.retryDelay ?? undefined,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.createdAt),
        runningAt: row.runningAt ? new Date(row.runningAt) : undefined,
        scheduledAt: row.scheduledAt ? new Date(row.scheduledAt) : undefined,
        succeededAt: row.succeededAt ? new Date(row.succeededAt) : undefined,
        failedAt: row.failedAt ? new Date(row.failedAt) : undefined,
      }
    })
  }

  async getDistinctWorkflowNames(): Promise<string[]> {
    const result = await this.runs.distinct('workflow')
    return result.sort()
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    const row = await this.versions.findOne({
      workflowName: name,
      graphHash,
    })

    if (!row) return null
    return {
      graph: row.graph,
      source: row.source,
    }
  }

  async getAIGeneratedWorkflows(
    agentName?: string
  ): Promise<Array<{ workflowName: string; graphHash: string; graph: any }>> {
    const filter: Record<string, any> = { source: 'ai-agent', status: 'active' }
    if (agentName) {
      const escaped = agentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.workflowName = { $regex: `^ai:${escaped}:` }
    }
    const rows = await this.versions.find(filter).toArray()
    return rows.map((row) => ({
      workflowName: row.workflowName,
      graphHash: row.graphHash,
      graph: row.graph,
    }))
  }

  async deleteRun(id: string): Promise<boolean> {
    const steps = await this.steps.find({ workflowRunId: id }).toArray()
    const stepIds = steps.map((s) => s._id)

    if (stepIds.length > 0) {
      await this.stepHistory.deleteMany({ workflowStepId: { $in: stepIds } })
      await this.steps.deleteMany({ workflowRunId: id })
    }

    const result = await this.runs.deleteOne({ _id: id })
    return result.deletedCount > 0
  }

  private mapRunRow(row: WorkflowRunDoc): WorkflowRun {
    return {
      id: row._id,
      workflow: row.workflow,
      status: row.status as WorkflowStatus,
      input: row.input,
      output: row.output ?? undefined,
      error: row.error ?? undefined,
      inline: row.inline,
      graphHash: row.graphHash ?? undefined,
      deterministic: row.deterministic ?? undefined,
      plannedSteps: row.plannedSteps ?? undefined,
      wire: row.wire ?? { type: 'unknown' },
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }
}
