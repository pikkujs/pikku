import type { Finding, Severity } from './finding.js'
import { runCli, type RunCliOptions } from './run-cli.js'

/** `runCli` with the worktree already chosen. */
export type GateRunCli = (
  args: string[],
  options: Omit<RunCliOptions, 'cwd'>
) => Promise<Finding[]>

/** Everything a gate gets from the engine. Tests pass a fake one. */
export type GateWire = {
  worktree: string
  base: string
  attempt: number
  changeId: string
  /** A directory the gate may use for its own files; not part of the worktree. */
  scratch: string
  runCli: GateRunCli
}

export type HarnessGate = {
  name: string
  description: string
  /** Findings at or above this severity fail the gate. */
  failOn: Severity
  /** Paths the gate may change. */
  writes: string[]
  run: (wire: GateWire) => Promise<Finding[]>
  /** A fixer's read-only check mode; it finds nothing once the fixer's commit is in. */
  check?: (wire: GateWire) => Promise<Finding[]>
}

export const createGateWire = (
  wire: Omit<GateWire, 'runCli'>,
  onRun?: RunCliOptions['onRun']
): GateWire => ({
  ...wire,
  runCli: (args, options) =>
    runCli(args, { onRun, ...options, cwd: wire.worktree }),
})
