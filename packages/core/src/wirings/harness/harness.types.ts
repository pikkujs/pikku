import type { PikkuWire } from '../../types/core.types.js'

/** How serious a finding is. A gate fails on findings at or above its `failOn`. */
export type HarnessSeverity = 'low' | 'medium' | 'high'

/** One thing a gate or gate agent found. */
export type HarnessFinding = {
  file?: string
  line?: number
  severity: HarnessSeverity
  rule?: string
  message: string
}

/** A gate in a harness's list with the gate's `failOn` replaced. */
export type HarnessGateOverride = {
  name: string
  failOn: HarnessSeverity
}

/** What a harness can list by reference: a gate or a gate agent. */
export type HarnessGateReference = {
  name: string
  /** The same gate with another `failOn`, for this harness only. */
  with: (override: { failOn: HarnessSeverity }) => HarnessGateOverride
}

/**
 * A gate decided by code. It is an ordinary function config: the engine runs
 * `func` and reads `workflowRetries` and `workflowTimeout` from its meta.
 */
export type PikkuHarnessGate<Services = any> = HarnessGateReference & {
  description: string
  failOn: HarnessSeverity
  /** Paths the gate may change. */
  writes: string[]
  workflowRetries?: number
  workflowTimeout?: string
  func: (
    services: Services,
    data: void,
    wire: PikkuWire
  ) => Promise<HarnessFinding[]>
}

/** A gate decided by a model, reading the change with a goal. */
export type PikkuHarnessGateAgent = HarnessGateReference & {
  description: string
  model: string
  goal: string
  failOn: HarnessSeverity
}

/**
 * A harness: the agent that builds and the gates its work must pass.
 * `GateName` is the generated union of the project's gate names.
 */
export type PikkuHarness<GateName extends string = string> = {
  name: string
  description: string
  /** The builder. `model` is a model alias, resolved by whoever runs the harness. */
  agent: { model: string }
  gates: ReadonlyArray<GateName | HarnessGateReference | HarnessGateOverride>
}

/** Inspector-generated metadata for every harness, keyed by name. */
export type HarnessesMeta = Record<
  string,
  {
    name: string
    description: string
    harness: true
    agent: { model: string }
    /** `failOn` is present only where the harness overrides the gate's own. */
    gates: { name: string; failOn?: HarnessSeverity }[]
    sourceFile: string
    exportedName?: string
  }
>

/** Inspector-generated metadata for every gate agent, keyed by name. */
export type HarnessGateAgentsMeta = Record<
  string,
  {
    name: string
    description: string
    harness: true
    model: string
    goal: string
    failOn: HarnessSeverity
    sourceFile: string
    exportedName?: string
  }
>
