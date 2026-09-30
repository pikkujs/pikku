import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { dim } from '../lib/output.js'
import { FabricPreconditionError } from '../lib/errors.js'

/** What `deploy logs` shows unless told otherwise — the end is where builds say why they stopped. */
export const DEFAULT_TAIL_LINES = 100

export const FabricDeployLogsInput = z.object({
  deploymentId: z.string(),
  tail: z.coerce.number().int().positive().optional(),
  full: z.boolean().default(false),
})

export const FabricDeployLogsOutput = z.object({
  deploymentId: z.string(),
  log: z.string().nullable(),
  totalLines: z.number(),
  shownLines: z.number(),
})

/**
 * A deployment's build log, read on request. `deploy apply` never prints it: the
 * log can be thousands of lines and is only useful once you know you want it.
 * It is the same log the console shows (the builder's R2 output followed by any
 * failure recorded after the build), cut to the last lines unless `--full`.
 */
export const FabricDeployLogs = pikkuSessionlessFunc({
  description:
    "Print a deployment's build log (last lines by default; --full for all of it)",
  input: FabricDeployLogsInput,
  output: FabricDeployLogsOutput,
  func: async (_services, { deploymentId, tail, full }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new FabricPreconditionError(
        'Not logged in. Run `pikku fabric login` first.'
      )

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { log } = await rpc.invoke('getDeploymentBuildLog', { deploymentId })
    if (!log) return { deploymentId, log: null, totalLines: 0, shownLines: 0 }

    const lines = log.trimEnd().split('\n')
    const keep = full ? lines.length : (tail ?? DEFAULT_TAIL_LINES)
    const shown = lines.slice(-keep)
    return {
      deploymentId,
      log: shown.join('\n'),
      totalLines: lines.length,
      shownLines: shown.length,
    }
  },
})

export const renderDeployLogs = (
  _s: unknown,
  {
    deploymentId,
    log,
    totalLines,
    shownLines,
  }: z.infer<typeof FabricDeployLogsOutput>
): void => {
  if (log === null) {
    console.log(
      dim(
        `No build log recorded for ${deploymentId}. The deployment failed or was cancelled before a build started.`
      )
    )
    return
  }
  if (shownLines < totalLines) {
    console.log(
      dim(
        `… ${totalLines - shownLines} earlier line(s) — \`--full\` for all, or \`--tail <n>\``
      )
    )
  }
  console.log(log)
}
