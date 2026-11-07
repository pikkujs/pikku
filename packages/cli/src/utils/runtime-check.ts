/**
 * Whether this process can run the CLI, or has to hand over to bun.
 *
 * The CLI opens SQLite through `node:sqlite`, which node ships unflagged only
 * from 24. The bin keeps its node shebang so a project needs nothing but
 * `pikku …`; on an older node the bin re-runs itself under bun, which has the
 * module, instead of failing on the first database it opens.
 */

export const MIN_NODE_MAJOR = 24

/** Set on the re-executed child, so a `bun` that is not really bun cannot loop. */
export const RUNTIME_REEXEC_ENV = 'PIKKU_RUNTIME_REEXEC'

export type RuntimeDecision =
  | { action: 'run' }
  | { action: 'reexec-bun' }
  | { action: 'refuse'; message: string }

export interface RuntimeFacts {
  /** `process.versions.bun`, undefined under node. */
  bunVersion?: string
  /** `process.versions.node`. */
  nodeVersion: string
  /** Whether this process is already the re-executed child. */
  reexecuted: boolean
}

export const nodeTooOldMessage = (nodeVersion: string): string =>
  `pikku needs Node ${MIN_NODE_MAJOR} or later, or bun — this is Node ${nodeVersion}, ` +
  `which has no node:sqlite. Upgrade Node, or install bun (https://bun.sh) ` +
  `and pikku will run itself on it.`

export const decideRuntime = ({
  bunVersion,
  nodeVersion,
  reexecuted,
}: RuntimeFacts): RuntimeDecision => {
  if (bunVersion) return { action: 'run' }
  const major = Number.parseInt(nodeVersion.split('.')[0] ?? '', 10)
  if (major >= MIN_NODE_MAJOR) return { action: 'run' }
  if (reexecuted)
    return { action: 'refuse', message: nodeTooOldMessage(nodeVersion) }
  return { action: 'reexec-bun' }
}
