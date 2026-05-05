import type { CoreSingletonServices } from '@pikku/core'
import type { PikkuDoStepDispatch } from './pikku-workflow-do-service.js'
import type { DurableObjectNamespace } from '@cloudflare/workers-types'

export interface PikkuStepWorkerEnv {
  WORKFLOW_DO: DurableObjectNamespace
}

/**
 * Stateless step worker for the DO orchestrator.
 *
 * Runs as a separate CF Worker (or `WorkerEntrypoint`) bound as
 * `STEP_WORKER` from the orchestrator DO. Receives step dispatches via the
 * `run()` RPC, executes the named pikku RPC, and calls back to the
 * originating DO via the `WORKFLOW_DO` namespace.
 *
 * Usage in user code:
 * ```ts
 * import { WorkerEntrypoint } from 'cloudflare:workers'
 * import { PikkuStepWorker } from '@pikku/cloudflare/workflow-do'
 *
 * export default class extends WorkerEntrypoint<Env> {
 *   private worker = new PikkuStepWorker(this.env)
 *   async run(dispatch) { return this.worker.run(dispatch) }
 * }
 * ```
 */
export class PikkuStepWorker<
  Env extends PikkuStepWorkerEnv = PikkuStepWorkerEnv,
> {
  constructor(protected readonly env: Env) {}

  async run(dispatch: PikkuDoStepDispatch): Promise<void> {
    const stub = this.env.WORKFLOW_DO.get(
      this.env.WORKFLOW_DO.idFromName(dispatch.runId)
    ) as unknown as {
      recordStepResult(stepId: string, result: unknown): Promise<void>
      recordStepError(
        stepId: string,
        err: { name?: string; message: string; stack?: string; code?: string }
      ): Promise<void>
    }

    const stepId = await this.beginStep(dispatch)

    try {
      const result = await this.executeStep(dispatch)
      await stub.recordStepResult(stepId, result)
    } catch (e: any) {
      await stub.recordStepError(stepId, {
        name: e?.name,
        message: e?.message ?? String(e),
        stack: e?.stack,
        code: e?.code,
      })
    }
  }

  /**
   * Resolve the stepId for this dispatch. Default expects the orchestrator
   * to pass `stepId` directly via an extension to the dispatch payload.
   * If your orchestrator only passes stepName, override to look it up.
   */
  protected async beginStep(dispatch: PikkuDoStepDispatch): Promise<string> {
    const ext = dispatch as PikkuDoStepDispatch & { stepId?: string }
    if (ext.stepId) return ext.stepId
    throw new Error(
      'PikkuStepWorker.beginStep: dispatch is missing stepId. Override beginStep to resolve stepName → stepId via the orchestrator stub.'
    )
  }

  /**
   * Execute the user's pikku function for this step.
   * Default uses the singleton RPC service.
   */
  protected async executeStep(dispatch: PikkuDoStepDispatch): Promise<unknown> {
    const services = (
      globalThis as unknown as {
        __PIKKU_SINGLETON_SERVICES__?: CoreSingletonServices & {
          rpcService?: { rpc(name: string, data: unknown): Promise<unknown> }
        }
      }
    ).__PIKKU_SINGLETON_SERVICES__
    const rpc = services?.rpcService
    if (!rpc) {
      throw new Error(
        'PikkuStepWorker: no pikku RPC service available; set up singleton services in the step worker before dispatching'
      )
    }
    return rpc.rpc(dispatch.rpcName, dispatch.data)
  }
}
