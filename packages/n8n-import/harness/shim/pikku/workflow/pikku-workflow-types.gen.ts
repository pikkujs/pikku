/** Harness shim — stands in for `.pikku/workflow/pikku-workflow-types.gen.ts`. */

export type WorkflowNodeConfig = {
  input?: (ref: (name: string, path?: string) => unknown) => Record<string, unknown>
  next?: string | string[] | Record<string, string[]>
  onError?: string | string[]
  retries?: number
  retryDelay?: number
  notes?: string
}

export type WorkflowGraphConfig = {
  name: string
  description?: string
  tags?: string[]
  notes?: string[]
  nodes: Record<string, string>
  config: Record<string, WorkflowNodeConfig>
}

export const pikkuWorkflowGraph = (
  config: WorkflowGraphConfig
): WorkflowGraphConfig => config
