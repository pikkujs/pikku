import { pikkuSessionlessFunc } from '#pikku/function'
import { pikkuWorkflowFunc } from '#pikku/workflow'

export const enqueueJob = pikkuSessionlessFunc<
  { id: string },
  { queued: true }
>({
  auth: false,
  func: async ({ queueService }, { id }) => {
    await queueService!.add('jobs', { id })
    return { queued: true }
  },
})

export const processJob = pikkuSessionlessFunc<{ id: string }, void>({
  auth: false,
  func: async ({ logger }, { id }) => {
    logger.info(`NATS_VERIFIER job started ${id}`)
    if (id === 'slow') await new Promise((resolve) => setTimeout(resolve, 3000))
    logger.info(`NATS_VERIFIER job done ${id}`)
  },
})

export const tick = pikkuSessionlessFunc<void, void>({
  auth: false,
  func: async ({ logger, variables }) => {
    logger.info(
      `NATS_VERIFIER cron fired stage=${await variables.get('PIKKU_STAGE')}`
    )
  },
})

export const runStep = pikkuSessionlessFunc<{ id: string }, { id: string }>({
  auth: false,
  func: async ({ logger }, { id }) => {
    logger.info(`NATS_VERIFIER workflow step ${id}`)
    return { id }
  },
})

export const flow = pikkuWorkflowFunc<{ id: string }, { done: true }>({
  auth: false,
  func: async ({}, data, { workflow }) => {
    await workflow.do('First step', 'runStep', { id: data.id })
    await workflow.sleep('Pause', '1s')
    await workflow.do('Second step', 'runStep', {
      id: data.id + '-after-sleep',
    })
    return { done: true }
  },
})

export const startFlow = pikkuSessionlessFunc<
  { id: string },
  { runId: string }
>({
  auth: false,
  func: async (_services, data, { rpc }) => rpc.startWorkflow('flow', data),
})
