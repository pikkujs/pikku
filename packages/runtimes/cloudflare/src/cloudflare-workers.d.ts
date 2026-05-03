// Minimal ambient types for the `cloudflare:workers` runtime module so this
// package type-checks in a node context without depending on
// @cloudflare/workers-types. The CF runtime provides the actual implementation.
declare module 'cloudflare:workers' {
  export class WorkerEntrypoint<E = unknown> {
    constructor(ctx: unknown, env: E)
    env: E
    ctx: unknown
    fetch?(request: Request): Promise<Response> | Response
    queue?(batch: unknown): Promise<void> | void
    scheduled?(controller: unknown): Promise<void> | void
  }
}
