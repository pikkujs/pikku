import {
  pikkuFunc,
  pikkuSessionlessFunc,
} from '../../.pikku/function/pikku-function-types.gen.js'
import { getQueueWorkers } from '@pikku/core/queue'
import { rpcService } from '@pikku/core/rpc'
import { requireManagerPermission } from '../security.js'

export const healthCheck = pikkuSessionlessFunc<
  void,
  {
    ok: true
    runtime: {
      singletonServicesPresent: string[]
      queueWorkers: string[]
    }
  }
>({
  func: async (services) => ({
    ok: true,
    runtime: {
      singletonServicesPresent: Object.entries(services)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key),
      queueWorkers: services.queueService ? [...getQueueWorkers().keys()] : [],
    },
  }),
})

export const startTaskCrudRun = pikkuFunc<
  { title: string; description?: string; requiresApproval?: boolean },
  { runId: string }
>({
  auth: true,
  permissions: {
    role: requireManagerPermission,
  },
  func: async (services, data, wire) => {
    if (!services.workflowService) {
      const error = new Error('workflowService is not configured') as Error & {
        code?: string
      }
      error.code = 'SERVICE_NOT_AVAILABLE'
      throw error
    }

    const currentSession = await wire.getSession?.()
    const rpc = rpcService.getContextRPCService(services, {
      session: currentSession,
    })

    const { runId } = await services.workflowService.startWorkflow(
      'taskCrudWorkflow',
      data,
      rpc
    )

    return { runId }
  },
})

export const startWorkflowRun = pikkuFunc<
  { workflowName: string; data?: unknown },
  { runId: string }
>({
  auth: true,
  permissions: {
    role: requireManagerPermission,
  },
  func: async (services, data, wire) => {
    if (!services.workflowService) {
      const error = new Error('workflowService is not configured') as Error & {
        code?: string
      }
      error.code = 'SERVICE_NOT_AVAILABLE'
      throw error
    }

    const currentSession = await wire.getSession?.()
    const rpc = rpcService.getContextRPCService(services, {
      session: currentSession,
    })

    const { runId } = await services.workflowService.startWorkflow(
      data.workflowName,
      data.data ?? {},
      rpc
    )

    return { runId }
  },
})

export const resumeWorkflowRun = pikkuFunc<
  { runId: string },
  { runId: string }
>({
  auth: true,
  permissions: {
    role: requireManagerPermission,
  },
  func: async (services, data) => {
    if (!services.workflowService) {
      const error = new Error('workflowService is not configured') as Error & {
        code?: string
      }
      error.code = 'SERVICE_NOT_AVAILABLE'
      throw error
    }
    await services.workflowService.resumeWorkflow(data.runId)
    return { runId: data.runId }
  },
})

export const invokeRPC = pikkuFunc<
  { rpcName: string; data?: unknown },
  { output: unknown }
>({
  auth: true,
  permissions: {
    role: requireManagerPermission,
  },
  func: async (services, data, wire) => {
    const currentSession = await wire.getSession?.()
    const rpc = rpcService.getContextRPCService(services, {
      session: currentSession,
    })
    const output = await rpc.invoke(data.rpcName, data.data)
    return { output }
  },
})

export const getWorkflowRun = pikkuFunc<
  { runId: string },
  {
    runId: string
    status: string
    output?: unknown
    error?: { code?: string; message?: string }
  }
>({
  auth: true,
  permissions: {
    role: requireManagerPermission,
  },
  func: async (services, data) => {
    if (!services.workflowService) {
      const error = new Error('workflowService is not configured') as Error & {
        code?: string
      }
      error.code = 'SERVICE_NOT_AVAILABLE'
      throw error
    }

    const run = await services.workflowService.getRun(data.runId)
    if (!run) {
      throw new Error(`Workflow run not found: ${data.runId}`)
    }

    return {
      runId: run.id,
      status: run.status,
      output: run.output,
      error: run.error,
    }
  },
})

export const getWorkflowRunHistory = pikkuFunc<
  { runId: string },
  {
    runId: string
    history: Array<{
      stepName: string
      status: string
      attemptCount: number
    }>
  }
>({
  auth: true,
  permissions: {
    role: requireManagerPermission,
  },
  func: async (services, data) => {
    if (!services.workflowService) {
      const error = new Error('workflowService is not configured') as Error & {
        code?: string
      }
      error.code = 'SERVICE_NOT_AVAILABLE'
      throw error
    }

    const history = await services.workflowService.getRunHistory(data.runId)
    return {
      runId: data.runId,
      history: history.map((entry) => ({
        stepName: entry.stepName,
        status: entry.status,
        attemptCount: entry.attemptCount,
      })),
    }
  },
})
