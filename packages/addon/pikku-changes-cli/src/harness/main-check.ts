import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { runGateOnce } from './engine.js'
import { splitEnvironment } from './environment.js'
import { atOrAbove, formatFinding, type GateFindings } from './feedback.js'
import type { HarnessGate } from './gate.js'
import { gitIn } from './git.js'
import { redact } from './redact.js'

export type MainCheckOptions = {
  /** The main checkout. */
  cwd: string
  /** The gates that judge it, one after another (Studio's: `pikku check`). */
  gates: HarnessGate[]
  signal?: AbortSignal
  gitBinary?: string
}

/**
 * Runs the main checkout's gates after a merge, in order, as the engine runs a changeset's (each
 * gate's `failOn` and `workflowTimeout`). Resolves with the gates that failed, empty when the checkout is
 * green. A gate that cannot answer throws its HarnessInfraError.
 */
export const checkMain = async ({
  cwd,
  gates,
  signal,
  gitBinary,
}: MainCheckOptions): Promise<GateFindings[]> => {
  const git = gitIn(cwd, gitBinary)
  const gitDir = (await git(['rev-parse', '--absolute-git-dir'])).trim()
  const scratch = join(gitDir, 'pikku-harness', 'main-check')
  await mkdir(scratch, { recursive: true })
  const head = (await git(['rev-parse', 'HEAD'])).trim()
  const failing: GateFindings[] = []
  for (const gate of gates) {
    const findings = await runGateOnce(
      gate,
      {
        worktree: cwd,
        base: head,
        attempt: 1,
        changeId: 'target',
        scratch,
      },
      signal
    )
    const failed = findings.filter((f) => atOrAbove(f.severity, gate.failOn))
    if (failed.length) failing.push({ gate: gate.name, findings: failed })
  }
  return failing
}

/**
 * A failing check of the main checkout as the text a repair turn and the owner read: each gate's code findings,
 * then the environment findings apart, said to be no code to fix; at most `maxChars`.
 */
export const mainFailure = (
  failing: GateFindings[],
  maxChars = 8_000
): string => {
  const { environment } = splitEnvironment(
    failing.flatMap(({ findings }) => findings)
  )
  const blocks: string[] = []
  for (const { gate, findings } of failing) {
    const code = findings.filter((f) => !environment.includes(f))
    if (code.length)
      blocks.push(
        [`${redact(gate)} (${code.length}):`, ...code.map(formatFinding)].join(
          '\n'
        )
      )
  }
  if (environment.length)
    blocks.push(
      [
        `Environment findings (${environment.length}): modules or type definitions that cannot be resolved because dependencies are missing or broken in this checkout. They are not code to fix: leave them to the install:`,
        ...environment.map(formatFinding),
      ].join('\n')
    )
  const out = blocks.join('\n\n')
  return out.length > maxChars ? `${out.slice(0, maxChars)}\n…` : out
}
