import type {
  HarnessGateReference,
  HarnessSeverity,
  PikkuHarness,
  PikkuHarnessGate,
  PikkuHarnessGateAgent,
} from './harness.types.js'

const withFailOn =
  (name: string): HarnessGateReference['with'] =>
  ({ failOn }: { failOn: HarnessSeverity }) => ({ name, failOn })

/**
 * A gate decided by code: `func` returns what it found, and the engine fails
 * the gate on any finding at or above `failOn`. Read by the inspector; a
 * harness engine runs it.
 *
 * @experimental
 * @internal
 */
export const pikkuHarnessGate = <Services = any>(config: {
  /** Identifies the gate in a harness's `gates`. Unique per project. */
  name: string
  /** What the gate checks, in one line. */
  description: string
  /** The lowest finding severity that fails the gate. */
  failOn: HarnessSeverity
  /** Paths the gate may change. Defaults to `.pikku/**`. */
  writes?: string[]
  /** Extra runs after the gate could not answer. */
  workflowRetries?: number
  /** Longest one run may take (e.g. '30s', '5m'). */
  workflowTimeout?: string
  /** The check. Returns its findings; an empty list passes. */
  func: PikkuHarnessGate<Services>['func']
}): PikkuHarnessGate<Services> => ({
  ...config,
  writes: config.writes ?? ['.pikku/**'],
  with: withFailOn(config.name),
})

/**
 * A gate decided by a model that reads the change with `goal`. Read by the
 * inspector; a harness engine runs it.
 *
 * @experimental
 * @internal
 */
export const pikkuHarnessGateAgent = (config: {
  /** Identifies the gate agent in a harness's `gates`. Unique per project. */
  name: string
  /** What the gate agent checks, in one line. */
  description: string
  /** The model that reviews, as an alias resolved by whoever runs the harness. */
  model: string
  /** What the change must meet, phrased as the goal the reviewer checks. */
  goal: string
  /** The lowest finding severity that fails the gate. */
  failOn: HarnessSeverity
}): PikkuHarnessGateAgent => ({ ...config, with: withFailOn(config.name) })

/**
 * A harness: the agent that builds and the gates its work must pass. Read by
 * the inspector; a harness engine runs it.
 *
 * @experimental
 * @internal
 */
export const pikkuHarness = <GateName extends string = string>(
  config: PikkuHarness<GateName>
): PikkuHarness<GateName> => config
