import type {
  DurableObjectState,
  DurableObjectNamespace,
} from '@cloudflare/workers-types'
import type { CoreSingletonServices } from '@pikku/core'
import type { WorkflowRun, WorkflowRunWire } from '@pikku/core/workflow'
import type {
  PikkuWorkflowDoService,
  PikkuWorkflowDoEnv,
  PikkuDoStepDispatch,
} from './pikku-workflow-do-service.js'

const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export interface PikkuWorkflowDoOptions {
  retentionMs?: number
}

/**
 * Durable Object host for a single pikku workflow run.
 *
 * Responsibilities:
 * - Holds the per-run `PikkuWorkflowDoService` instance.
 * - Exposes RPC methods (`start`, `getRun`, `cancel`, `recordStepResult`,
 *   `recordStepError`) to the caller worker and the step worker.
 * - Implements `alarm()` to dispatch on the DO's pending alarm reason.
 *
 * Subclasses must implement `createService()` so they can wire whatever
 * RPC service / singleton-service plumbing their app needs.
 *
 * Wrangler binding example:
 * ```toml
 * [[durable_objects.bindings]]
 * name = "WORKFLOW_DO"
 * class_name = "MyWorkflowDO"
 *
 * [[services]]
 * binding = "STEP_WORKER"
 * service = "my-step-worker"
 * ```
 */
export abstract class PikkuWorkflowDO<
  Env extends PikkuWorkflowDoEnv = PikkuWorkflowDoEnv,
> {
  protected service?: PikkuWorkflowDoService<Env>
  protected options: PikkuWorkflowDoOptions

  constructor(
    protected readonly ctx: DurableObjectState,
    protected readonly env: Env,
    options: PikkuWorkflowDoOptions = {}
  ) {
    this.options = options
  }

  /**
   * Construct the per-run service instance. Override to inject any
   * subclass-specific config (e.g. custom backoff, R2 binding).
   */
  protected abstract createService(): PikkuWorkflowDoService<Env>

  /**
   * Provide a pikku RPC service for executing workflow steps inline.
   * Default uses pikku's singleton RPC service if configured.
   */
  protected getRPCService(): any {
    const services = (
      globalThis as unknown as {
        __PIKKU_SINGLETON_SERVICES__?: CoreSingletonServices & {
          rpcService?: any
        }
      }
    ).__PIKKU_SINGLETON_SERVICES__
    if (services?.rpcService) return services.rpcService
    throw new Error(
      'No pikku RPC service available — set up singleton services in the DO module before invoking workflows'
    )
  }

  protected getOrInitService(): PikkuWorkflowDoService<Env> {
    if (!this.service) {
      this.service = this.createService()
    }
    return this.service
  }

  // ─── Public DO RPC API ────────────────────────────────────────────

  async start<I>(input: {
    workflow: string
    input: I
    wire?: WorkflowRunWire
    graphHash?: string
    inline?: boolean
  }): Promise<{ runId: string }> {
    const service = this.getOrInitService()
    const runId = this.ctx.id.toString()
    const wire: WorkflowRunWire = {
      type: 'do',
      ...input.wire,
      id: runId,
    }
    return service.startWorkflow(
      input.workflow,
      input.input,
      wire,
      this.getRPCService(),
      { inline: input.inline ?? false }
    )
  }

  async getRun(): Promise<WorkflowRun | null> {
    const service = this.getOrInitService()
    return service.getRun(this.ctx.id.toString())
  }

  async getRunStatus() {
    const service = this.getOrInitService()
    return service.getRunStatus(this.ctx.id.toString())
  }

  async getRunHistory() {
    const service = this.getOrInitService()
    return service.getRunHistory(this.ctx.id.toString())
  }

  async cancel(reason?: string): Promise<void> {
    const service = this.getOrInitService()
    await service.updateRunStatus(
      this.ctx.id.toString(),
      'cancelled',
      undefined,
      reason ? { message: reason } : undefined
    )
    await service.setRetentionAlarm(
      this.options.retentionMs ?? DEFAULT_RETENTION_MS
    )
  }

  /** Called by the step worker after a step finishes successfully. */
  async recordStepResult(stepId: string, result: unknown): Promise<void> {
    const service = this.getOrInitService()
    await service.setStepResult(stepId, result)
    await service.resumeWorkflow(this.ctx.id.toString())
  }

  /** Called by the step worker on step failure. */
  async recordStepError(
    stepId: string,
    err: { name?: string; message: string; stack?: string; code?: string }
  ): Promise<void> {
    const service = this.getOrInitService()
    const error = Object.assign(new Error(err.message), {
      name: err.name ?? 'Error',
      stack: err.stack,
      code: err.code,
    })
    await service.setStepError(stepId, error)
    await service.resumeWorkflow(this.ctx.id.toString())
  }

  // ─── Alarm dispatcher ─────────────────────────────────────────────

  async alarm(): Promise<void> {
    const service = this.getOrInitService()
    const pending = await service.consumePendingAlarm()
    if (!pending) return

    const runId = this.ctx.id.toString()
    switch (pending.kind) {
      case 'sleep':
        await service.executeWorkflowSleepCompleted(runId, pending.stepId)
        return
      case 'orchestrator-retry':
        await service.runWorkflowJob(runId, this.getRPCService())
        return
      case 'step-retry':
        await service.runWorkflowJob(runId, this.getRPCService())
        return
      case 'retention':
        await this.ctx.storage.deleteAll()
        return
    }
  }
}

export type { DurableObjectNamespace, PikkuDoStepDispatch }
