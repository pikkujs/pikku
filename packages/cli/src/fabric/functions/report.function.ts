import { createInterface } from 'node:readline/promises'
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
} from '../lib/finding.js'
import {
  dropHeld,
  holdFinding,
  readHeld,
  runIdFor,
  type HeldFinding,
} from '../lib/held-findings.js'
import {
  REPORT_ANSWERS,
  parseAnswer,
  readConsent,
  saveConsent,
  type ReportAnswer,
} from '../lib/report.js'
import { FabricPreconditionError } from '../lib/errors.js'

/**
 * Every finding field is optional here and the strictness lives in
 * `FindingInput`, because `--stdin` supplies the whole finding at once. With
 * no finding at all, the command is the hand-over: it asks about what is held.
 */
export const FabricReportInput = FindingInput.partial().extend({
  stdin: z.boolean().optional(),
  consent: z.string().optional(),
})

export const FabricReportOutput = z.object({
  sent: z.number(),
  held: z.number(),
  needsConsent: z.boolean(),
  reason: z.string().optional(),
})

const readStdin = async (): Promise<string> => {
  if (process.stdin.isTTY) {
    throw new FabricPreconditionError(
      '--stdin expects the finding as JSON on standard input, and nothing was piped in.'
    )
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

const askOnTerminal = async (): Promise<ReportAnswer | null> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await Promise.race([
      rl.question('Send them? [y]es / [n]o / [a]lways / ne[v]er: '),
      new Promise<null>((done) => rl.once('close', () => done(null))),
    ])
    return answer === null ? null : parseAnswer(answer)
  } finally {
    rl.close()
  }
}

/** Oldest first, stopping at the first refusal; what is left stays held. */
const sendHeld = async (held: HeldFinding[]) => {
  const { apiUrl } = await resolveApiContext()
  let sent = 0
  for (const entry of held) {
    const result = await postFinding({ apiUrl, payload: entry.payload })
    if (!result.sent) {
      console.log(
        `[fabric] could not send (${result.reason}) — ${held.length - sent} still held`
      )
      return { sent, held: held.length - sent, reason: result.reason }
    }
    await dropHeld([entry])
    sent++
  }
  console.log(`[fabric] sent ${sent} finding(s) — thank you`)
  return { sent, held: 0 }
}

export const FabricReport = pikkuSessionlessFunc({
  description:
    'Report a finding — something about pikku that cost time — to the Pikku team.',
  input: FabricReportInput,
  output: FabricReportOutput,
  func: async (_services, { stdin, consent, ...flags }) => {
    let answer: ReportAnswer | null = null
    if (consent !== undefined) {
      answer = parseAnswer(consent)
      if (!answer) {
        throw new FabricPreconditionError(
          `--consent is one of ${REPORT_ANSWERS.join(', ')}.`
        )
      }
    }
    const saved = await readConsent()
    if (!answer && saved === 'never') {
      console.log('[fabric] reporting is off')
      return { sent: 0, held: 0, needsConsent: false, reason: 'never' }
    }
    if ((answer === 'always' || answer === 'never') && answer !== saved) {
      await saveConsent(answer)
    }

    const runId = await runIdFor()
    const filing =
      stdin ||
      Object.values(flags).some(
        (value) => value !== undefined && value !== false
      )

    if (filing) {
      const parsed = stdin
        ? parseFindingJson(await readStdin())
        : parseFinding(flags)
      if ('problems' in parsed) {
        throw new FabricPreconditionError(parsed.problems.join('\n'))
      }
      const problems = validateFinding(parsed.finding)
      if (problems.length > 0) {
        throw new FabricPreconditionError(problems.join('\n'))
      }
      const payload = buildFindingPayload(
        parsed.finding,
        await collectReportEnvironment(),
        runId
      )
      console.log(renderReceipt(payload))
      await holdFinding(payload)
    }

    const held = await readHeld(runId)
    const decided = answer ?? (saved === 'always' ? 'always' : null)

    if (decided === 'no' || decided === 'never') {
      await dropHeld(held)
      console.log(
        decided === 'never'
          ? '[fabric] not sent, and reporting is now off'
          : '[fabric] not sent'
      )
      return { sent: 0, held: 0, needsConsent: false, reason: decided }
    }
    if (decided) {
      return { ...(await sendHeld(held)), needsConsent: false }
    }

    if (filing) {
      console.log(
        `[fabric] held until hand-over (${held.length} held) — then run \`pikku fabric report\` and ask the user`
      )
      return { sent: 0, held: held.length, needsConsent: false }
    }

    if (held.length === 0) {
      console.log('[fabric] nothing held from this build')
      return { sent: 0, held: 0, needsConsent: false }
    }
    console.log(`[fabric] ${held.length} finding(s) held from this build:`)
    for (const { payload } of held) {
      console.log(`  - ${payload.title} (${payload.kind})`)
    }
    const asked = process.stdin.isTTY ? await askOnTerminal() : null
    if (asked) {
      if (asked === 'always' || asked === 'never') await saveConsent(asked)
      if (asked === 'yes' || asked === 'always') {
        return { ...(await sendHeld(held)), needsConsent: false }
      }
      await dropHeld(held)
      console.log('[fabric] not sent')
      return { sent: 0, held: 0, needsConsent: false, reason: asked }
    }
    console.log(
      '[fabric] not sent. Ask the user whether to send these (yes / no / always / never), then run: pikku fabric report --consent <answer>'
    )
    return { sent: 0, held: held.length, needsConsent: true }
  },
})
