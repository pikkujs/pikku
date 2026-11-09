// Stand-ins for the @pikku/core surface the wire rules read.
export interface Rpc {
  depth: number
  invoke(name: string, data?: unknown): Promise<unknown>
  mesh(name: string, data?: unknown): Promise<unknown>
  startWorkflow(name: string, data?: unknown): Promise<unknown>
}
export interface Wire {
  rpc: Rpc
  session?: { userId: string }
  channel?: { channelId: string }
  http?: { request?: unknown; response?: unknown }
  workflow?: unknown
  logger: { info(...a: unknown[]): void }
}
export interface Services {
  logger: { info(...a: unknown[]): void }
  db: { run(sql: string): void }
}
type Handler<O> = (services: Services, data: any, wire: Wire) => O
export declare const pikkuSessionlessFunc: <O>(f: Handler<O> | { func: Handler<O> }) => Handler<O>
type Workflow = { do: (...args: any[]) => Promise<any> }
export declare const pikkuWorkflowFunc: <I, O>(c: {
  func: (services: Services, data: I, wire: { workflow: Workflow }) => Promise<O>
}) => { func: unknown }
