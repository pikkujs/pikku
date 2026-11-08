import { createInterface } from 'node:readline/promises'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext, type ResolvedApiContext } from '../lib/config.js'
import { collectReportEnvironment } from '../lib/report-environment.js'
import {
  FindingInput,
  accountLabel,
  buildFindingPayload,
  parseFinding,
  parseFindingJson,
  findingRPC,
  postFinding,
  renderReceipt,
  validateFinding,
} from '../lib/finding.js'
import {
  dropHeld,
  heldDir,
  holdFinding,
  readHeld,
  runIdFor,
  type HeldFinding,
  fallbackRunId,
} from '../lib/held-findings.js'
import {
  REPORT_ANSWERS,
  parseAnswer,
  readConsent,
  saveConsent,
  type ReportAnswer,
} from '../lib/report.js'
import { CloudPreconditionError } from '@pikku/cli/addon-support'

/**
 * Every finding field is optional here and the strictness lives in
 * `FindingInput`, because `--stdin` supplies the whole finding at once. With
 * no finding at all, the command is the hand-over: it asks about what is held.
 */
export const CloudReportInput = FindingInput.partial().extend({
  stdin: z.boolean().optional(),
  consent: z.string().optional(),
})

export const CloudReportOutput = z.object({
  sent: z.number(),
  held: z.number(),
  needsConsent: z.boolean(),
  reason: z.string().optional(),
  /** The account the question is about; set when `needsConsent` is. */
  account: z.string().optional(),
  /** What could not be written. Filing never fails on these. */
  warnings: z.array(z.string()).optional(),
})

const readStdin = async (): Promise<string> => {
  if (process.stdin.isTTY) {
    throw new CloudPreconditionError(
      '--stdin expects the finding as JSON on standard input, and nothing was piped in.'
    )
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

const askOnTerminal = async (account: string): Promise<ReportAnswer | null> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await Promise.race([
      rl.question(
        `Send them to the Pikku team as ${account}? [y]es / [n]o / [a]lways / ne[v]er: `
      ),
      new Promise<null>((done) => rl.once('close', () => done(null))),
    ])
    return answer === null ? null : parseAnswer(answer)
  } finally {
    rl.close()
  }
}

/** Local trouble is a warning, never a failure: a finding must not fail a build. */
type Attempt = <T>(
  what: string,
  work: () => Promise<T>,
  otherwise: T
) => Promise<T>

/** Oldest first, stopping at the first refusal; what is left stays held. */
const sendHeld = async (
  rpc: ReturnType<typeof findingRPC>,
  held: HeldFinding[],
  attempt: Attempt
) => {
  let sent = 0
  for (const entry of held) {
    const result = await postFinding({ rpc, payload: entry.payload })
    if (!result.sent) {
      console.log(
        `[pikku] could not send (${result.reason}) — ${held.length - sent} still held`
      )
      return { sent, held: held.length - sent, reason: result.reason }
    }
    await attempt(
      'could not clear a sent finding',
      () => dropHeld([entry]),
      undefined
    )
    sent++
  }
  console.log(`[pikku] sent ${sent} finding(s) — thank you`)
  return { sent, held: 0 }
}

export const CloudReport = pikkuSessionlessFunc({
  description:
    'File a finding — something about pikku that cost time — and send what is held to the Pikku team once logged in and told yes.',
  input: CloudReportInput,
  output: CloudReportOutput,
  func: async (_services, { stdin, consent, ...flags }) => {
    const warnings: string[] = []
    const attempt: Attempt = async (what, work, otherwise) => {
      try {
        return await work()
      } catch (error) {
        const warning = `${what}: ${(error as Error).message}`
        console.warn(`[pikku] ${warning}`)
        warnings.push(warning)
        return otherwise
      }
    }
    const finish = <T extends object>(result: T) =>
      warnings.length > 0 ? { ...result, warnings } : result
    const remember = (answer: 'always' | 'never') =>
      attempt(
        `could not save "${answer}", so it applies to this run only (set PIKKU_REPORT=${answer} where the home directory is read-only)`,
        () => saveConsent(answer),
        undefined
      )

    let answer: ReportAnswer | null = null
    if (consent !== undefined) {
      answer = parseAnswer(consent)
      if (!answer) {
        throw new CloudPreconditionError(
          `--consent is one of ${REPORT_ANSWERS.join(', ')}.`
        )
      }
    }
    const saved = await readConsent()
    if (!answer && saved === 'never') {
      console.log('[pikku] reporting is off')
      return { sent: 0, held: 0, needsConsent: false, reason: 'never' }
    }
    if ((answer === 'always' || answer === 'never') && answer !== saved) {
      await remember(answer)
    }

    const runId = await attempt(
      'could not record the run id',
      () => runIdFor(),
      fallbackRunId()
    )
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
        throw new CloudPreconditionError(parsed.problems.join('\n'))
      }
      const problems = validateFinding(parsed.finding)
      if (problems.length > 0) {
        throw new CloudPreconditionError(problems.join('\n'))
      }
      const payload = buildFindingPayload(
        parsed.finding,
        await collectReportEnvironment(),
        runId
      )
      console.log(renderReceipt(payload))
      await attempt(
        'could not keep this finding',
        () => holdFinding(payload),
        undefined
      )
    }

    // A declined finding that could not be deleted is still on disk, so the
    // count reports what is really left rather than claiming zero.
    const discard = async (entries: HeldFinding[]) => {
      await attempt(
        'could not clear what is held',
        () => dropHeld(entries),
        undefined
      )
      const left = await attempt(
        'could not re-read what is held',
        () => readHeld(runId),
        entries
      )
      return left.length
    }

    const held = await attempt(
      'could not read what is held',
      () => readHeld(runId),
      []
    )
    const decided = answer ?? (saved === 'always' ? 'always' : null)

    if (decided === 'no' || decided === 'never') {
      const left = await discard(held)
      console.log(
        decided === 'never'
          ? '[pikku] not sent, and reporting is now off'
          : '[pikku] not sent'
      )
      return finish({
        sent: 0,
        held: left,
        needsConsent: false,
        reason: decided,
      })
    }

    const { apiUrl, token } = await attempt<
      Pick<ResolvedApiContext, 'apiUrl' | 'token'>
    >(
      'could not read the login, so what is held stays here',
      () => resolveApiContext({ resolveProject: false }),
      { apiUrl: '', token: null }
    )
    if (!token) {
      if (held.length === 0) {
        console.log('[pikku] nothing held from this build')
        return finish({ sent: 0, held: 0, needsConsent: false })
      }
      console.log(
        `[pikku] ${held.length} finding(s) kept on this computer in ${heldDir()}`
      )
      return finish({
        sent: 0,
        held: held.length,
        needsConsent: false,
        reason: 'not-logged-in',
      })
    }

    const rpc = findingRPC(apiUrl, token)
    if (decided) {
      return finish({
        ...(await sendHeld(rpc, held, attempt)),
        needsConsent: false,
      })
    }

    if (filing) {
      console.log(
        `[pikku] held until hand-over (${held.length} held) — then run \`pikku report\` and ask the user`
      )
      return finish({ sent: 0, held: held.length, needsConsent: false })
    }

    if (held.length === 0) {
      console.log('[pikku] nothing held from this build')
      return finish({ sent: 0, held: 0, needsConsent: false })
    }
    console.log(`[pikku] ${held.length} finding(s) held from this build:`)
    for (const { payload } of held) {
      console.log(`  - ${payload.title} (${payload.kind})`)
    }
    const account = await accountLabel(rpc, apiUrl)
    const asked = process.stdin.isTTY ? await askOnTerminal(account) : null
    if (asked) {
      if (asked === 'always' || asked === 'never') await remember(asked)
      if (asked === 'yes' || asked === 'always') {
        return finish({
          ...(await sendHeld(rpc, held, attempt)),
          needsConsent: false,
        })
      }
      const left = await discard(held)
      console.log('[pikku] not sent')
      return finish({
        sent: 0,
        held: left,
        needsConsent: false,
        reason: asked,
      })
    }
    console.log(
      `[pikku] not sent. Ask the user whether to send these to the Pikku team as ${account} (yes / no / always / never), then run: pikku report --consent <answer>`
    )
    return finish({ sent: 0, held: held.length, needsConsent: true, account })
  },
})
