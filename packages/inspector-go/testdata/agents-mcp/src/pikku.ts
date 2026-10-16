// Local stand-ins for the generated #pikku wrappers: the inspector matches the
// callee name, so this fixture needs no codegen.
type Func<In, Out> = (services: { logger: unknown }, data: In) => Promise<Out>
type Config<In, Out> = {
  func: Func<In, Out>
  name?: string
  title?: string
  description?: string
  tags?: unknown
  mcp?: boolean
  override?: string
}
export const pikkuFunc = <In, Out>(c: Config<In, Out>) => c
export const pikkuSessionlessFunc = <In, Out>(c: Config<In, Out>) => c
export const pikkuMCPToolFunc = <In, Out>(c: Config<In, Out>) => c
export const pikkuMCPResourceFunc = <In, Out>(c: Config<In, Out>) => c
export const pikkuMCPPromptFunc = <In, Out>(c: Config<In, Out>) => c
export const pikkuAgent = (c: Record<string, unknown>) => c
export const pikkuAgentScorer = (c: Record<string, unknown>) => c
export const pikkuAgentJudge = (c: Record<string, unknown>) => c
export const pikkuWorkflow = (c: Record<string, unknown>) => c
export const wireMCPResource = (c: Record<string, unknown>) => c
export const wireMCPPrompt = (c: Record<string, unknown>) => c
export const ref = (name: string) => name
export const workflow = (name: string) => name
