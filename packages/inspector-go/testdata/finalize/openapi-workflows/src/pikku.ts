// Local stand-ins for the generated #pikku wrappers: the inspector matches the
// callee name, so this fixture needs no codegen.
type Workflow = {
  do: (...args: any[]) => Promise<any>
  sleep: (name: string, duration: string) => Promise<void>
  cancel: (reason?: string) => Promise<never>
}
type Func<In, Out> = (services: { logger: unknown }, data: In) => Promise<Out>
type WorkflowFunc<In, Out> = (
  services: { logger: unknown },
  data: In,
  wire: { workflow: Workflow }
) => Promise<Out>
type Config<In, Out> = {
  func: Func<In, Out>
  title?: string
  description?: string
  version?: number
  tags?: string[]
  expose?: boolean
}
export const pikkuFunc = <In, Out>(c: Config<In, Out>) => c
export const pikkuSessionlessFunc = <In, Out>(c: Config<In, Out>) => c
export const pikkuWorkflowFunc = <In, Out>(c: {
  func: WorkflowFunc<In, Out>
  expose?: boolean
  description?: string
}) => c
export const pikkuWorkflowGraph = (c: Record<string, unknown>) => c
export const wireHTTP = (c: Record<string, unknown>) => c
export const wireScheduler = (c: Record<string, unknown>) => c
export const wireQueueWorker = (c: Record<string, unknown>) => c
export const workflow = (name: string) => ({ name }) as any
export const workflowStart = (name: string) => ({ name }) as any
export const workflowStatus = (name: string) => ({ name }) as any
export const graphStart = (name: string, node: string) =>
  ({ name, node }) as any
