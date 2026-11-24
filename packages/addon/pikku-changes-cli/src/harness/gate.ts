import { join } from 'node:path'
import type {
  PikkuHarnessGate,
  PikkuHarnessGateWire,
} from '@pikku/core/harness'
import { HarnessInfraError } from './finding.js'
import { runCli, type RunCliOptions } from './run-cli.js'

/**
 * When a gate runs in an attempt, read from its `writes`: a gate that writes only inside `.pikku`
 * directories (codegen) runs first and alone (`check`), a gate that writes anywhere else is a `fixer` that runs
 * alone and whose changes the engine commits, and a gate that writes nothing runs beside the other
 * read-only gates (`gate`).
 */
export type GateStage = 'check' | 'fixer' | 'gate'

/** A path pattern inside a `.pikku` directory, at the root or in a package. */
const GENERATED = /^(?:\*\*\/)?\.pikku\//

export const stageOf = ({
  writes,
}: Pick<PikkuHarnessGate, 'writes'>): GateStage =>
  writes.length === 0
    ? 'gate'
    : writes.every((glob) => GENERATED.test(glob))
      ? 'check'
      : 'fixer'

/** The tools pinned for a run, by name: absolute paths found once when it starts. */
export type HarnessTools = Readonly<Record<string, string>>

/** Where the locks of a gate's running tools are kept, in its scratch dir. */
export const toolLocksIn = (scratch: string) => join(scratch, 'tools')

/** The wire a gate gets. Without a `signal` it gets one that is never aborted. */
export const createGateWire = (
  fields: Omit<PikkuHarnessGateWire, 'runCli' | 'signal' | 'tool'> & {
    signal?: AbortSignal
  },
  tools: HarnessTools,
  onRun?: RunCliOptions['onRun']
): PikkuHarnessGateWire => {
  const signal = fields.signal ?? new AbortController().signal
  return {
    ...fields,
    signal,
    tool: (name) => {
      const path = tools[name]
      if (!path)
        throw new HarnessInfraError(
          'missing-binary',
          `No ${name} is pinned for this run, so a gate that runs ${name} cannot answer`
        )
      return path
    },
    runCli: (args, options) =>
      runCli(args, {
        onRun,
        ...options,
        cwd: fields.worktree,
        signal,
        lockDir: toolLocksIn(fields.scratch),
      }),
  }
}
