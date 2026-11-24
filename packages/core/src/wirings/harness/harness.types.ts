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

/** What a tool printed and how it exited, as a gate's parser reads it. */
export type HarnessCliOutput = { stdout: string; stderr: string; code: number }

/**
 * What a harness engine hands a gate as `wire.gate`: the change it judges and
 * the only way it runs a tool. A gate takes no other input.
 *
 * @experimental
 * @internal
 */
export type PikkuHarnessGateWire = {
  /** Absolute path of the checkout the change is built in; tools run there. */
  worktree: string
  /** The commit the change is judged against (`base...HEAD`). */
  base: string
  /** The builder's attempt being judged, from 1. */
  attempt: number
  /** The change the engine's own commits name in their `Change-Id` trailer. */
  changeId: string
  /** What the harness run was started with; a gate that reads it checks its shape. */
  input: unknown
  /** A directory for the gate's own files, outside the checkout. */
  scratch: string
  /** Aborted when the engine stops the gate (its timeout passed or the run was stopped). */
  signal: AbortSignal
  /** The absolute path of a tool pinned for this run; throws when the run has none. */
  tool: (name: string) => string
  /**
   * Runs `binary` (from `tool`) in the worktree and returns what `parse` finds,
   * redacted. Throws when the tool gives no answer: it cannot start, times
   * out, prints what `parse` rejects, or exits outside `okCodes` with nothing found.
   */
  runCli: (
    args: string[],
    options: {
      binary: string
      parse: (output: HarnessCliOutput) => HarnessFinding[]
      okCodes?: number[]
      timeoutMs?: number
      env?: Record<string, string>
    }
  ) => Promise<HarnessFinding[]>
}

/**
 * A gate decided by code. It is an ordinary function config: the engine runs
 * `func` with `wire.gate` and reads `workflowRetries` and `workflowTimeout`.
 */
export type PikkuHarnessGate<Services = any> = HarnessGateReference & {
  description: string
  failOn: HarnessSeverity
  /** Paths the gate may change. */
  writes: string[]
  /** Rules of this gate's findings a person may waive; the builder never can. */
  waivable?: string[]
  workflowRetries?: number
  workflowTimeout?: string
  func: (
    services: Services,
    data: void,
    wire: { gate: PikkuHarnessGateWire }
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
