import type { Finding, Severity } from './finding.js'
import { runCli, type RunCliOptions } from './run-cli.js'

/** `runCli` with the worktree already chosen. */
export type GateRunCli = (
  args: string[],
  options: Omit<RunCliOptions, 'cwd' | 'signal'>
) => Promise<Finding[]>

/** Everything a gate gets from the engine. Tests pass a fake one. */
export type GateWire = {
  worktree: string
  base: string
  attempt: number
  changeId: string
  /** A directory the gate may use for its own files; not part of the worktree. */
  scratch: string
  /** Aborted when the engine gives up on this run (its `workflowTimeout` passed); `runCli` honours it. */
  signal: AbortSignal
  runCli: GateRunCli
}

/**
 * When a gate runs in an attempt: `check` gates first and one at a time, then `fixer` gates one at a
 * time (each followed by an engine commit of what it changed), then the read-only `gate` stage in
 * parallel.
 */
export type GateStage = 'check' | 'fixer' | 'gate'

export type HarnessGate = {
  name: string
  description: string
  /** Defaults to `gate`. */
  stage?: GateStage
  /** Findings at or above this severity fail the gate. */
  failOn: Severity
  /** Paths the gate may change; defaults to `.pikku/**`. */
  writes?: string[]
  /** Extra tries after an infra error: `n` retries is `n + 1` runs. Defaults to 0. */
  workflowRetries?: number
  /** Longest one run may take, as milliseconds or a duration such as `'5min'`. */
  workflowTimeout?: string | number
  run: (wire: GateWire) => Promise<Finding[]>
  /** A fixer's read-only check mode; it finds nothing once the fixer's commit is in. */
  check?: (wire: GateWire) => Promise<Finding[]>
}

/** Without a `signal` the wire gets one that is never aborted. */
export const createGateWire = (
  wire: Omit<GateWire, 'runCli' | 'signal'> & { signal?: AbortSignal },
  onRun?: RunCliOptions['onRun']
): GateWire => {
  const signal = wire.signal ?? new AbortController().signal
  return {
    ...wire,
    signal,
    runCli: (args, options) =>
      runCli(args, { onRun, ...options, cwd: wire.worktree, signal }),
  }
}
