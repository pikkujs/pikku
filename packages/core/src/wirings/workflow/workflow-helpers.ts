import { WorkflowRunNotFoundError } from './pikku-workflow-service.js'

export function workflow<
  TWorkflowMap extends Record<string, { input: any; output: any }>,
>(
  workflowName: string & keyof TWorkflowMap,
  options?: { pollIntervalMs?: number }
): { func: (services: any, data: any, wire: any) => Promise<any> } {
  return {
    func: async (services: any, data: any, { rpc }: any) => {
      return services.workflowService.runToCompletion(
        workflowName,
        data,
        rpc,
        options
      )
    },
  }
}

export function workflowStart<
  TWorkflowMap extends Record<string, { input: any; output: any }>,
>(
  workflowName: string & keyof TWorkflowMap
): {
  func: (services: any, data: any, wire: any) => Promise<{ runId: string }>
} {
  return {
    func: async (_services: any, data: any, { rpc }: any) => {
      return rpc.startWorkflow(workflowName, data)
    },
  }
}

export function workflowStatus<
  TWorkflowMap extends Record<string, { input: any; output: any }>,
>(
  _workflowName: string & keyof TWorkflowMap
): {
  func: (
    services: any,
    data: { runId: string }
  ) => Promise<{
    id: string
    status: 'running' | 'completed' | 'failed' | 'cancelled'
    output?: any
    error?: { message?: string }
  }>
} {
  return {
    func: async (services: any, data: { runId: string }) => {
      const run = await services.workflowService.getRun(data.runId)
      if (!run) {
        throw new WorkflowRunNotFoundError(data.runId)
      }
      return {
        id: run.id,
        status: run.status,
        output: run.output,
        error: run.error ? { message: run.error.message } : undefined,
      }
    },
  }
}

export function graphStart<
  TGraphsMap extends Record<string, Record<string, any>>,
>(
  graphName: string & keyof TGraphsMap,
  startNode: string
): {
  func: (services: any, data: any, wire: any) => Promise<{ runId: string }>
} {
  return {
    func: async (_services: any, data: any, { rpc }: any) => {
      return rpc.startWorkflow(graphName, data, { startNode })
    },
  }
}
