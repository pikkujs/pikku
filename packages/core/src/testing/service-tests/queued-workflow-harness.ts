import type { PikkuWorkflowService } from '../../wirings/workflow/pikku-workflow-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addWorkflow } from '../../wirings/workflow/dsl/workflow-runner.js'
import type { CompensatingFor } from '../../wirings/workflow/dsl/workflow-dsl.types.js'

export type Handler = {
  forward: (data: any, wire: any) => Promise<any> | any
  compensate?: (data: any, context: CompensatingFor) => Promise<void> | void
  queued?: boolean
}

interface Job {
  queue: string
  data: any
  attempts?: number
  attempt?: number
}

/**
 * Drives a workflow the way a deployment does: every orchestration and every
 * `workflowQueued` step goes through a queue, and a pump plays the workers.
 * Delays are ignored, so a retry runs on the next pass.
 */
export class QueuedWorkflowHarness {
  handlers: Record<string, Handler> = {}
  log: string[] = []
  contexts: Array<{ rpc: string; context: CompensatingFor | undefined }> = []
  recovering: Array<{ rpc: string; from: any }> = []
  queue: Job[] = []
  jobsRun: Array<{ queue: string; step?: string }> = []
  ws: PikkuWorkflowService
  /** Return true to drop the job instead of running it, simulating a worker that never ran. */
  dropWhen?: (job: Job) => boolean
  /** Make `queue.add` throw for a job, simulating the broker being unreachable. */
  rejectAddWhen?: (queue: string, data: any) => boolean

  constructor(service: PikkuWorkflowService) {
    resetPikkuState()
    this.ws = service
    const queueService = {
      add: async (queue: string, data: any, options?: any) => {
        if (this.rejectAddWhen?.(queue, data)) {
          throw new Error('broker unreachable')
        }
        this.queue.push({ queue, data, attempts: options?.attempts ?? 1 })
      },
    }
    pikkuState(null, 'package', 'singletonServices', {
      logger: { error() {}, info() {}, warn() {}, debug() {} },
      queueService,
      workflowService: this.ws,
    } as never)
  }

  readonly rpc = {
    rpcWithWire: async (rpcName: string, data: any, wire: any) => {
      const isCompensation = rpcName.endsWith(':compensate')
      const base = isCompensation
        ? rpcName.slice(0, -':compensate'.length)
        : rpcName
      const handler = this.handlers[base]!
      this.contexts.push({
        rpc: rpcName,
        context: wire.workflow?.compensatingFor,
      })
      if (isCompensation) {
        this.log.push(`undo:${base}`)
        return handler.compensate!(data, wire.workflow.compensatingFor)
      }
      this.log.push(`do:${base}`)
      if (wire.graph?.recoveringFrom) {
        this.recovering.push({ rpc: base, from: wire.graph.recoveringFrom })
      }
      return handler.forward(data, wire)
    },
  }

  register(name: string, handler: Handler) {
    this.handlers[name] = handler
    pikkuState(null, 'rpc', 'meta')[name] = name
    pikkuState(null, 'function', 'meta')[name] = {
      name,
      pikkuFuncId: name,
      sessionless: true,
      permissions: [],
      workflowQueued: handler.queued !== false,
      ...(handler.compensate ? { compensate: true } : {}),
    } as never
  }

  defineDsl(name: string, body: (workflow: any, input: any) => Promise<any>) {
    pikkuState(null, 'workflows', 'meta')[name] = {
      name,
      pikkuFuncId: name,
      source: 'dsl',
      graphHash: `${name}-hash`,
    } as never
    pikkuState(null, 'function', 'meta')[name] = {
      name,
      sessionless: true,
      permissions: [],
    } as never
    addWorkflow(name, {
      func: async (_services: any, input: any, wire: any) =>
        body(wire.workflow, input),
    } as never)
  }

  defineGraph(name: string, entry: string, nodes: Record<string, any>) {
    pikkuState(null, 'workflows', 'meta')[name] = {
      name,
      pikkuFuncId: name,
      source: 'graph',
      entryNodeIds: [entry],
      graphHash: `${name}-hash`,
      nodes: Object.fromEntries(
        Object.entries(nodes).map(([id, node]) => [
          id,
          { nodeId: id, rpcName: id, retries: 0, ...node },
        ])
      ),
    } as never
  }

  async start(name: string, input: any = {}): Promise<string> {
    const { runId } = await this.ws.startWorkflow(
      name,
      input,
      { type: 'test' },
      this.rpc as never
    )
    await this.pump()
    return runId
  }

  /** Run jobs until the queue is empty. */
  async pump(limit = 500): Promise<void> {
    for (let i = 0; i < limit && this.queue.length > 0; i++) {
      const job = this.queue.shift()!
      if (this.dropWhen?.(job)) continue
      this.jobsRun.push({ queue: job.queue, step: job.data.stepName })
      try {
        if (job.data.stepName !== undefined) {
          await this.ws.executeWorkflowStep(
            job.data.runId,
            job.data.stepName,
            job.data.rpcName,
            job.data.data,
            this.rpc as never
          )
        } else {
          await this.ws.orchestrateWorkflow(job.data.runId, this.rpc as never)
        }
      } catch {
        job.attempt = (job.attempt ?? 1) + 1
        if (job.attempt <= (job.attempts ?? 1)) this.queue.push(job)
      }
    }
    if (this.queue.length > 0) throw new Error('queue did not drain')
  }

  async run(runId: string) {
    return (await this.ws.getRun(runId))!
  }

  async steps(runId: string) {
    return this.ws.getRunSteps(runId)
  }

  get undone() {
    return this.log.filter((l) => l.startsWith('undo'))
  }

  ok(output: any = {}): Handler {
    return { forward: async () => output }
  }

  boom(message = 'boom'): Handler {
    return {
      forward: async () => {
        throw new Error(message)
      },
    }
  }

  undoable(output: any = {}): Handler {
    return { ...this.ok(output), compensate: async () => {} }
  }
}
