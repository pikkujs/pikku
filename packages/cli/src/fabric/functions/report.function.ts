import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { collectReportEnvironment } from '../lib/report-environment.js'
import {
  FindingInput,
  buildFindingPayload,
  postFinding,
  renderReceipt,
  validateFinding,
  type FindingPayload,
} from '../lib/finding.js'
import { flushSpool, readSpool, spoolFinding } from '../lib/finding-spool.js'

export const FabricReportInput = FindingInput

export const FabricReportOutput = z.object({
  sent: z.boolean(),
  reason: z.string().optional(),
  spooled: z.boolean(),
  queued: z.number(),
})

/**
 * Every path that cannot send holds the finding instead. The states that stop
 * a send — logged out, unlinked, fabric unreachable — are the states a finding
 * is most likely to be describing, so dropping it loses exactly the reports
 * worth having.
 */
const hold = async (
  payload: FindingPayload,
  reason: string,
  projectId: string | null,
  message: string
) => {
  await spoolFinding({ payload, reason, projectId })
  const queued = (await readSpool()).length
  console.log(
    `[fabric] ${message} — finding queued (${queued} waiting, sent on your next report)`
  )
  return { sent: false, reason, spooled: true, queued }
}

export const FabricReport = pikkuSessionlessFunc({
  description:
    'Report a finding — something about pikku that cost time — to the linked fabric project.',
  input: FabricReportInput,
  output: FabricReportOutput,
  func: async (_services, input) => {
    const problems = validateFinding(input)
    if (problems.length > 0) {
      throw new Error(problems.join('\n'))
    }

    const payload = buildFindingPayload(input, await collectReportEnvironment())
    console.log(renderReceipt(payload))

    const ctx = await resolveApiContext()
    if (!ctx.token) {
      return hold(payload, 'not-logged-in', ctx.projectId, 'not logged in')
    }
    if (!ctx.projectId) {
      return hold(payload, 'not-linked', null, 'no project linked')
    }

    const flushed = await flushSpool({
      apiUrl: ctx.apiUrl,
      token: ctx.token,
      projectId: ctx.projectId,
    })
    if (flushed.sent > 0) {
      console.log(`[fabric] sent ${flushed.sent} finding(s) held from earlier`)
    }

    const result = await postFinding({
      apiUrl: ctx.apiUrl,
      token: ctx.token,
      projectId: ctx.projectId,
      payload,
    })
    if (!result.sent) {
      return hold(
        payload,
        result.reason ?? 'send-failed',
        ctx.projectId,
        `fabric did not accept it (${result.reason})`
      )
    }
    console.log('[fabric] finding sent')
    return { sent: true, spooled: false, queued: flushed.remaining }
  },
})
