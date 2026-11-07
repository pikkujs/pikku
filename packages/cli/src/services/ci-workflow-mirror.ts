import type { WorkflowRunMirror } from '@pikku/core/workflow'
import type { CLILogger } from './cli-logger.service.js'

// `pikku all --json` is read by tooling, and its steps are not news to anyone.
const SILENT_WORKFLOWS = new Set(['allWorkflow'])

/**
 * Puts workflow steps on the NDJSON stream, so whatever drives a CLI workflow
 * can show progress and name the step that failed. Text output is unchanged.
 */
export class CLIWorkflowMirror implements WorkflowRunMirror {
  private runs = new Map<string, string>()
  private steps = new Map<string, { runId: string; stepName: string }>()

  constructor(private logger: CLILogger) {}

  private emit(event: string, data: Record<string, unknown>) {
    if (this.logger.getOutputMode() !== 'json') return
    this.logger.info({ message: event, type: 'info', data })
  }

  private emitStep(stepId: string, event: string, extra = {}) {
    const step = this.steps.get(stepId)
    if (step) this.emit(event, { ...step, ...extra })
  }

  async createRun(runId: string, workflowName: string) {
    if (SILENT_WORKFLOWS.has(workflowName)) return
    this.runs.set(runId, workflowName)
    this.emit('workflow.run.created', { runId, workflowName })
  }

  async updateRunStatus(
    id: string,
    status: string,
    _output?: unknown,
    error?: { message?: string }
  ) {
    if (!this.runs.has(id)) return
    this.emit('workflow.run.status', {
      runId: id,
      status,
      error: error?.message,
    })
  }

  async insertStepState(
    runId: string,
    step: { stepId: string; stepName: string }
  ) {
    if (!this.runs.has(runId)) return
    this.steps.set(step.stepId, { runId, stepName: step.stepName })
  }

  async setStepRunning(stepId: string) {
    this.emitStep(stepId, 'workflow.step.running')
  }

  async setStepResult(stepId: string) {
    this.emitStep(stepId, 'workflow.step.succeeded')
  }

  async setStepError(stepId: string, error: { message?: string }) {
    this.emitStep(stepId, 'workflow.step.failed', { error: error.message })
  }

  async setStepScheduled() {}
  async setStepChildRunId() {}
  async createRetryAttempt() {}
  async setBranchTaken() {}
  async updateRunState() {}
  async upsertWorkflowVersion() {}
  async updateWorkflowVersionStatus() {}
}
