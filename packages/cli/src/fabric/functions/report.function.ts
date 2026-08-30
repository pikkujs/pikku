import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { collectReportEnvironment } from '../lib/report-environment.js'
import {
  FindingInput,
  buildFindingPayload,
  parseFinding,
  parseFindingJson,
  postFinding,
  renderReceipt,
  validateFinding,
  type FindingPayload,
} from '../lib/finding.js'
import { flushSpool, readSpool, spoolFinding } from '../lib/finding-spool.js'

/**
 * Every field is optional here and the strictness lives in `FindingInput`,
 * because `--stdin` supplies the whole finding at once and the flags then
 * carry nothing. Whichever path was used, the same schema decides whether a
 * finding is well-formed.
 */
export const FabricReportInput = FindingInput.partial().extend({
  stdin: z.boolean().optional(),
})

export const FabricReportOutput = z.object({
  sent: z.boolean(),
  reason: z.string().optional(),
  spooled: z.boolean(),
  queued: z.number(),
})

const readStdin = async (): Promise<string> => {
  if (process.stdin.isTTY) {
    throw new Error(
      '--stdin expects the finding as JSON on standard input, and nothing was piped in.'
    )
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Every path that cannot send holds the finding instead. The states that stop
 * a send — logged out, fabric unreachable — are the states a finding is most
 * likely to be describing, so dropping it loses exactly the reports worth
 * having.
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
    'Report a finding — something about pikku that cost time — to fabric.',
  input: FabricReportInput,
  output: FabricReportOutput,
  func: async (_services, { stdin, ...flags }) => {
    const parsed = stdin
      ? parseFindingJson(await readStdin())
      : parseFinding(flags)
    if ('problems' in parsed) {
      throw new Error(parsed.problems.join('\n'))
    }

    const problems = validateFinding(parsed.finding)
    if (problems.length > 0) {
      throw new Error(problems.join('\n'))
    }

    const payload = buildFindingPayload(
      parsed.finding,
      await collectReportEnvironment()
    )
    console.log(renderReceipt(payload))

    const ctx = await resolveApiContext()
    if (!ctx.token) {
      return hold(payload, 'not-logged-in', ctx.projectId, 'not logged in')
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
