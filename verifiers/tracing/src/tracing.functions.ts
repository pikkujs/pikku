import { ForbiddenError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku/function'
import { wireHTTP } from '#pikku/http'
import { wireQueueWorker } from '#pikku/queue'
import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

/** One hop as the function saw it. */
export type Hop = { at: string; traceId?: string; parentSpanId?: string }

export const hops: Hop[] = []

export const traceEcho = pikkuSessionlessFunc<{ at?: string }, Hop>({
  remote: true,
  func: async (_services, { at }, { trace, traceId }) => {
    const hop = { at: at ?? 'http', traceId, parentSpanId: trace?.parentSpanId }
    hops.push(hop)
    return hop
  },
})

export const traceCallsMesh = pikkuSessionlessFunc<void, { mesh: Hop } & Hop>({
  func: async (_services, _data, { rpc, traceId }) => ({
    at: 'mesh-caller',
    traceId,
    mesh: await rpc.mesh('traceEcho', { at: 'mesh' }),
  }),
})

export const traceEnqueues = pikkuSessionlessFunc<void, Hop>({
  func: async ({ queueService }, _data, { traceId }) => {
    await queueService!.add('trace-job', { at: 'job' })
    return { at: 'enqueuer', traceId }
  },
})

export const traceJob = pikkuSessionlessFunc<{ at: string }, void>({
  func: async (_services, { at }, { traceId }) => {
    hops.push({ at, traceId })
  },
})

export const traceSchedules = pikkuSessionlessFunc<void, Hop>({
  func: async ({ schedulerService }, _data, { traceId }) => {
    await schedulerService!.scheduleRPC(5, 'traceJob', { at: 'delayed' })
    return { at: 'scheduler', traceId }
  },
})

export const traceStartsRun = pikkuSessionlessFunc<void, Hop>({
  func: async (_services, _data, { rpc, traceId }) => {
    await rpc.startWorkflow('traceRun', {})
    return { at: 'starter', traceId }
  },
})

export const traceRun = pikkuWorkflowFunc<{}, void>({
  auth: false,
  func: async ({}, _data, { workflow }) => {
    await workflow.do('Step one', 'traceJob', { at: 'step-one' })
    await workflow.do('Step two', 'traceJob', { at: 'step-two' })
  },
})

export const traceFails = pikkuSessionlessFunc<void, void>({
  func: async () => {
    throw new ForbiddenError()
  },
})

wireHTTP({
  route: '/trace/fails',
  method: 'post',
  auth: false,
  func: traceFails,
})
wireHTTP({
  route: '/trace/echo',
  method: 'post',
  auth: false,
  func: traceEcho,
})
wireHTTP({
  route: '/trace/mesh',
  method: 'post',
  auth: false,
  func: traceCallsMesh,
})
wireHTTP({
  route: '/trace/job',
  method: 'post',
  auth: false,
  func: traceEnqueues,
})
wireHTTP({
  route: '/trace/delayed',
  method: 'post',
  auth: false,
  func: traceSchedules,
})
wireHTTP({
  route: '/trace/run',
  method: 'post',
  auth: false,
  func: traceStartsRun,
})
wireQueueWorker({ name: 'trace-job', func: traceJob })
