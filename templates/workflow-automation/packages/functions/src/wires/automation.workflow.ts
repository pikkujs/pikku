import { z } from 'zod'
import { pikkuWorkflowFunc } from '#pikku/workflow'
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'
import { randomUUID } from 'node:crypto'

// @snippet start wireWorkflow
export const validateGraph = pikkuSessionlessFunc({
  description: 'Refuse a graph the engine could not execute.',
  func: async ({ kysely }, { flowId }: { flowId: string }) => {
    const version = await kysely
      .selectFrom('flowVersion')
      .select(['flowVersionId', 'graph'])
      .where('flowId', '=', flowId)
      .orderBy('version', 'desc')
      .executeTakeFirstOrThrow()

    const nodes = JSON.parse(version.graph).nodes ?? []
    if (nodes.length === 0) throw new Error('A flow needs at least one node')
    return { flowVersionId: version.flowVersionId, nodeCount: nodes.length }
  },
})

export const freezeVersion = pikkuSessionlessFunc({
  description: 'Take an immutable copy of the graph being published.',
  func: async ({ kysely }, { flowId, graph }: { flowId: string; graph: string }) => {
    const [{ next } = { next: 0 }] = await kysely
      .selectFrom('flowVersion')
      .select((eb) => eb.fn.max('version').as('next'))
      .where('flowId', '=', flowId)
      .execute()

    const flowVersionId = randomUUID()
    await kysely
      .insertInto('flowVersion')
      .values({ flowVersionId, flowId, version: Number(next ?? 0) + 1, graph, createdBy: 'system' })
      .execute()
    return { flowVersionId }
  },
})

export const activateFlow = pikkuSessionlessFunc({
  description: 'Let the flow start running on its trigger.',
  func: async ({ kysely }, { flowId }: { flowId: string }) => {
    await kysely
      .updateTable('flow')
      .set({ status: 'active' })
      .where('flowId', '=', flowId)
      .execute()
    return { flowId }
  },
})

// Publishing a flow is itself a workflow — which is the joke, and also the
// point. Validation must happen before the version is frozen, and activation
// only after, or the platform can end up running a graph it already rejected.
export const publishFlow = pikkuWorkflowFunc<
  { flowId: string; graph: string },
  { flowId: string; flowVersionId: string }
>({
  expose: true,
  func: async (_services, data, { workflow }) => {
    await workflow.do('Validate graph', 'validateGraph', { flowId: data.flowId })
    const frozen = await workflow.do('Freeze version', 'freezeVersion', {
      flowId: data.flowId,
      graph: data.graph,
    })
    await workflow.do('Activate', 'activateFlow', { flowId: data.flowId })
    return { flowId: data.flowId, flowVersionId: frozen.flowVersionId }
  },
})
// @snippet end wireWorkflow

export const startFlowPublishInput = z.object({
  flowId: z.string(),
  graph: z.string(),
})
export const startFlowPublishOutput = z.object({ runId: z.string() })

/**
 * The workflow's front door.
 *
 * A workflow cannot be called over plain RPC — invoked that way it gets no
 * workflow context and dies on `workflow.do` being undefined. It has to be
 * *started*, which needs an ordinary function to start it. Without one
 * `publishFlow` had no caller at all: its steps were real logic nothing could
 * begin, and the same shape as the shop's `startCheckout`.
 */
export const startFlowPublish = pikkuFunc({
  expose: true,
  description: 'Publish a flow version: validate the graph, freeze it, activate it.',
  input: startFlowPublishInput,
  output: startFlowPublishOutput,
  func: async (_services, data, { rpc }) => {
    const runId = await rpc.startWorkflow('publishFlow', data)
    return { runId: String(runId) }
  },
})
