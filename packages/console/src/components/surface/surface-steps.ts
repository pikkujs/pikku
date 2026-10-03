import type {
  SurfaceEntryPoint,
  SurfaceLeaf,
  SurfaceStep,
  SurfaceSymbol,
} from './surface.types'

/**
 * The page documents what you call, not what you annotate with. Types and
 * interfaces are reached through the values below rather than imported for
 * their own sake, so they are left to the editor.
 */
export const isEntrypoint = (symbol: SurfaceSymbol): boolean =>
  symbol.kind !== 'type' && symbol.kind !== 'interface'

export const entrypointsOf = (leaf: SurfaceLeaf): SurfaceSymbol[] =>
  leaf.symbols.filter(isEntrypoint)

export type StepDefinition = {
  step: SurfaceStep
  /** What the reader is doing here, in the words they would use themselves. */
  prose: string
}

export const STEPS: StepDefinition[] = [
  {
    step: 'create a function',
    prose:
      'Everything starts as a function. It receives its data without knowing whether that arrived as a path param, a query string, a message body or a queue job, so nothing you write here has to be rewritten when the transport changes.',
  },
  {
    step: 'enhance it',
    prose:
      'Give it the things a function needs to be worth calling: typed errors it can throw, configuration it can read, and secrets and credentials it never has to hold itself.',
  },
  {
    step: 'wire it up',
    prose:
      'Now decide how the outside world reaches it. Each wiring is one call, and a function can carry several — the same handler answering an HTTP route, a queue job and an MCP tool.',
  },
  {
    step: 'guard it',
    prose:
      'Say who may call it. Sessions come from auth, scopes gate the call outside the permission pool, and neither lives inside the function body.',
  },
  {
    step: 'orchestrate it',
    prose:
      'Compose functions into something longer-running: a workflow with durable steps and retries, or an agent that chooses which of them to call.',
  },
  {
    step: 'test it',
    prose:
      'Drive the whole thing the way a user would, in scenarios that run against a real server rather than a mocked one.',
  },
]

export const STEP_ORDER: SurfaceStep[] = STEPS.map((each) => each.step)

export type StepGroup = {
  step: SurfaceStep
  prose: string
  leaves: SurfaceLeaf[]
}

export const stepsOf = (entryPoint: SurfaceEntryPoint): StepGroup[] =>
  STEPS.map(({ step, prose }) => ({
    step,
    prose,
    leaves: entryPoint.leaves
      .filter((leaf) => leaf.step === step)
      .map((leaf) => ({ ...leaf, symbols: entrypointsOf(leaf) }))
      .filter((leaf) => leaf.symbols.length > 0),
  })).filter((group) => group.leaves.length > 0)

export const exportsIn = (leaves: SurfaceLeaf[]): number =>
  leaves.reduce((total, leaf) => total + leaf.symbols.length, 0)

export const proseFor = (step: SurfaceStep): string =>
  STEPS.find((each) => each.step === step)?.prose ?? ''
