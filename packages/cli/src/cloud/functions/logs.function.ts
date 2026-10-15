import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { CloudPreconditionError } from '../../utils/precondition-error.js'

export const CloudLogsInput = z.object({
  branch: z.string().optional(),
  deployment: z.string().optional(),
  level: z.string().optional(),
  since: z.string().optional(),
  follow: z.boolean().optional(),
  json: z.boolean().optional(),
})

export const CloudLogsOutput = z.object({ count: z.number() })

interface LogEntry {
  timestamp: string
  level: string
  functionName: string
  message: string
  traceId?: string
}

function formatLog(log: LogEntry): string {
  return `${log.timestamp} ${log.level.toUpperCase().padEnd(5)} ${log.functionName} — ${log.message}`
}

/**
 * Stable identity for an entry across polls. OpenObserve doesn't expose a
 * monotonic id we can dedup on, so we hash the few fields that should be
 * unique together (timestamp + traceId + message). Keeps memory bounded —
 * the `seen` set is pruned to the last cursorWindow entries between polls.
 */
function logKey(log: LogEntry): string {
  return `${log.timestamp}|${log.traceId ?? ''}|${log.functionName}|${log.message}`
}

export const CloudLogs = pikkuSessionlessFunc({
  description: 'Stream or fetch logs for a stage / deployment via cloud API.',
  input: CloudLogsInput,
  output: CloudLogsOutput,
  func: async (_services, { branch, level, json, follow }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new CloudPreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )
    if (!ctx.projectId)
      throw new CloudPreconditionError(
        'No cloud project linked. Run `pikku cloud link` first.'
      )
    if (!branch)
      throw new CloudPreconditionError('Specify --branch <branch-name>.')

    const seen = new Set<string>()
    const cursorWindow = 5_000
    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const projectId = ctx.projectId

    const fetchAndPrintNew = async () => {
      const res = await rpc.invoke('getCloudLogsByStageKind', {
        projectId,
        branch,
        level: level ?? undefined,
      })
      let printed = 0
      for (const log of res.logs) {
        const k = logKey(log)
        if (seen.has(k)) continue
        seen.add(k)
        if (json) {
          console.log(JSON.stringify(log))
        } else {
          console.log(formatLog(log))
        }
        printed += 1
      }
      // Bound memory — keep the most recent cursorWindow keys.
      if (seen.size > cursorWindow) {
        const trimmed = Array.from(seen).slice(seen.size - cursorWindow)
        seen.clear()
        for (const k of trimmed) seen.add(k)
      }
      return printed
    }

    let count = await fetchAndPrintNew()
    if (follow) {
      // Server-side SSE for logs is a planned upgrade — OpenObserve doesn't
      // push natively without extra plumbing. For now we poll at 2s and
      // dedup against entries already printed, which gives `tail -f`-ish
      // behaviour without re-printing the full window each tick.
      while (true) {
        await new Promise((r) => setTimeout(r, 2000))
        count += await fetchAndPrintNew()
      }
    }
    return { count }
  },
})
