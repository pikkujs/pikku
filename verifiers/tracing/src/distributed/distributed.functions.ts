import { pikkuSessionlessFunc } from '#pikku/function'
import { wireHTTP } from '#pikku/http'
import { addTagMiddleware, pikkuMiddleware } from '#pikku/middleware'
import { wireQueueWorker } from '#pikku/queue'
import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { hop, record, role } from './recorder.js'

/** One call through the chain; `run` finds it in what the processes recorded. */
export type Dist = {
  run: string
  /** The service a mesh call goes to. */
  to?: string
  at?: string
  fail?: boolean
  failOnce?: boolean
  jobFails?: boolean
  jobFailsOnce?: boolean
  delay?: number
  namespace?: string
  targets?: string[]
}
type Hop = { traceId?: string; at?: string }

/**
 * An HTTP hop reaches a function through a generated handler, which makes a
 * span of its own, so the handler is written down too. After `next`, because
 * the mesh middleware adopts the caller's trace into this object further along.
 */
export const distEdge = pikkuMiddleware(async (_services, { trace }, next) => {
  try {
    await next()
  } finally {
    await record({
      kind: 'edge',
      traceId: trace?.traceId,
      spanId: trace?.spanId,
      parentSpanId: trace?.parentSpanId,
    })
  }
})

addTagMiddleware('pikku', [distEdge])

const seen = new Set<string>()
const firstTime = (key: string) => !seen.has(key) && !!seen.add(key)

export const distLeaf = pikkuSessionlessFunc<Dist, Hop>({
  remote: true,
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop(data.at ?? role, data.run, { traceId, trace })
    if (data.fail || (data.failOnce && firstTime(data.run))) {
      throw new Error(`${role} refuses`)
    }
    return { traceId: traceId, at: data.at ?? role }
  },
})

export const distRelay = pikkuSessionlessFunc<Dist, Hop>({
  remote: true,
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop('relay', data.run, { traceId, trace })
    return await rpc!.mesh('distLeaf', { ...data, to: 'd' })
  },
})

export const distEnqueue = pikkuSessionlessFunc<Dist, Hop>({
  remote: true,
  func: async ({ queueService }, data, { rpc, traceId, trace }) => {
    await hop('enqueue', data.run, { traceId, trace })
    await queueService!.add('dist-job', data, {
      attempts: data.jobFailsOnce ? 2 : 1,
      backoff: { type: 'fixed', delay: 50 },
      ...(data.delay ? { delay: data.delay } : {}),
    })
    return { traceId: traceId }
  },
})

export const distJob = pikkuSessionlessFunc<Dist, void>({
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop('job', data.run, { traceId, trace })
    if (data.jobFails || (data.jobFailsOnce && firstTime(data.run))) {
      throw new Error('the job refuses')
    }
    await rpc!.startWorkflow('distRun', data)
  },
})
wireQueueWorker({ name: 'dist-job', func: distJob })

export const distStepMesh = pikkuSessionlessFunc<Dist, Hop>({
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop('step-mesh', data.run, { traceId, trace })
    return await rpc!.mesh('distLeaf', { ...data, to: 'd', at: 'd' })
  },
})

export const distStepAddon = pikkuSessionlessFunc<Dist, Hop>({
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop('step-addon', data.run, { traceId, trace })
    return await (rpc!.invoke as any)('trusted:distLeaf', {
      ...data,
      at: 'addon',
    })
  },
})

export const distRun = pikkuWorkflowFunc<Dist, void>({
  auth: false,
  func: async ({}, data, { workflow }) => {
    await workflow.do('Mesh to D', 'distStepMesh', data)
    await workflow.do('Call the addon', 'distStepAddon', data)
  },
})

export const distChain = pikkuSessionlessFunc<Dist, Hop>({
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop('entry', data.run, { traceId, trace })
    await rpc!.mesh('distEnqueue', { ...data, to: 'b' })
    return { traceId: traceId }
  },
})

export const distFanOut = pikkuSessionlessFunc<Dist, Hop>({
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop('entry', data.run, { traceId, trace })
    await Promise.all(
      data.targets!.map((to) =>
        rpc!.mesh('distLeaf', { run: data.run, to, at: to })
      )
    )
    return { traceId: traceId }
  },
})

export const distFails = pikkuSessionlessFunc<Dist, Hop>({
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop('entry', data.run, { traceId, trace })
    return await rpc!.mesh('distRelay', { ...data, to: 'b', fail: true })
  },
})

/** The application's own retry: the same call again, from the same span. */
export const distRetries = pikkuSessionlessFunc<Dist, Hop>({
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop('entry', data.run, { traceId, trace })
    const call = { ...data, to: 'd', at: 'flaky', failOnce: true }
    return await rpc!
      .mesh('distLeaf', call)
      .catch(() => rpc!.mesh('distLeaf', call))
  },
})

export const distCallsAddon = pikkuSessionlessFunc<Dist, Hop>({
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop('entry', data.run, { traceId, trace })
    const reply = await (rpc!.invoke as any)(`${data.namespace}:distLeaf`, {
      ...data,
      at: 'addon',
    })
    return { traceId, at: reply.traceId }
  },
})

/** Outlives its caller's timeout, then carries on working. */
export const distSlow = pikkuSessionlessFunc<Dist, Hop>({
  remote: true,
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop('slow', data.run, { traceId, trace })
    await new Promise((resolve) => setTimeout(resolve, 800))
    await hop('slow-after-the-caller-left', data.run, { traceId, trace })
    return await rpc!.invoke('distLeaf', { ...data, at: 'late-work' })
  },
})

export const distTimesOut = pikkuSessionlessFunc<Dist, Hop>({
  func: async (_services, data, { rpc, traceId, trace }) => {
    await hop('entry', data.run, { traceId, trace })
    return await (rpc!.invoke as any)('impatient:distSlow', data)
  },
})

/** The addon host's `POST /rpc/:rpcName`, as the generated route has it. */
export const distHostRpc = pikkuSessionlessFunc<
  { rpcName: string; data: unknown },
  unknown
>({
  tags: ['pikku'],
  func: async (_services, { rpcName, data }, { rpc }) =>
    await (rpc!.invoke as any)(rpcName, data),
})

wireHTTP({ route: '/dist/chain', method: 'post', auth: false, func: distChain })
wireHTTP({
  route: '/dist/fan-out',
  method: 'post',
  auth: false,
  func: distFanOut,
})
wireHTTP({ route: '/dist/fails', method: 'post', auth: false, func: distFails })
wireHTTP({
  route: '/dist/retries',
  method: 'post',
  auth: false,
  func: distRetries,
})
wireHTTP({
  route: '/dist/addon',
  method: 'post',
  auth: false,
  func: distCallsAddon,
})
wireHTTP({
  route: '/dist/times-out',
  method: 'post',
  auth: false,
  func: distTimesOut,
})
wireHTTP({
  route: '/rpc/:rpcName',
  method: 'post',
  auth: false,
  func: distHostRpc,
})
