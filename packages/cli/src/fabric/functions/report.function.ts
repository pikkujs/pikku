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
} from '../lib/finding.js'

export const FabricReportInput = FindingInput

export const FabricReportOutput = z.object({
  sent: z.boolean(),
  reason: z.string().optional(),
})

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
      console.log('[fabric] not logged in — finding not sent')
      return { sent: false, reason: 'not-logged-in' }
    }
    if (!ctx.projectId) {
      console.log('[fabric] no project linked — finding not sent')
      return { sent: false, reason: 'not-linked' }
    }

    const result = await postFinding({
      apiUrl: ctx.apiUrl,
      token: ctx.token,
      projectId: ctx.projectId,
      payload,
    })
    console.log(
      result.sent
        ? '[fabric] finding sent'
        : `[fabric] finding not sent (${result.reason})`
    )
    return result
  },
})
