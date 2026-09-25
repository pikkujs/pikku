import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { collectReportEnvironment } from '../lib/report-environment.js'
import {
  REPORT_ANSWERS,
  REPORT_MAX_BYTES,
  parseAnswer,
  postReport,
  readConsent,
  renderCard,
  saveConsent,
  type ReportAnswer,
} from '../lib/report.js'
import { FabricPreconditionError } from '../lib/errors.js'

export const FabricReportInput = z.object({
  file: z.string().optional(),
  consent: z.string().optional(),
})

export const FabricReportOutput = z.object({
  sent: z.boolean(),
  reason: z.string().optional(),
  needsConsent: z.boolean(),
})

const askOnTerminal = async (): Promise<ReportAnswer | null> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await Promise.race([
      rl.question('Send it? [y]es / [n]o / [a]lways / ne[v]er: '),
      new Promise<null>((done) => rl.once('close', () => done(null))),
    ])
    return answer === null ? null : parseAnswer(answer)
  } finally {
    rl.close()
  }
}

export const FabricReport = pikkuSessionlessFunc({
  description:
    'Send a build report — what pikku got wrong along the way — to the Pikku team.',
  input: FabricReportInput,
  output: FabricReportOutput,
  func: async (_services, { file = 'BUILD-REPORT.md', consent }) => {
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
      console.log('[fabric] reporting is off — nothing sent')
      return { sent: false, reason: 'never', needsConsent: false }
    }

    const path = resolve(file)
    if (!existsSync(path)) {
      throw new FabricPreconditionError(`No report at ${path}.`)
    }
    const report = await readFile(path, 'utf8')
    if (!report.trim()) {
      console.log('[fabric] the report is empty — nothing to send')
      return { sent: false, reason: 'empty', needsConsent: false }
    }
    if (Buffer.byteLength(report) > REPORT_MAX_BYTES) {
      throw new FabricPreconditionError(
        `${file} is over ${REPORT_MAX_BYTES / 1000} KB. A report describes what went wrong; leave out logs and dumps.`
      )
    }

    const { apiUrl } = await resolveApiContext()
    const payload = {
      report,
      environment: await collectReportEnvironment(),
      reportedAt: new Date().toISOString(),
    }
    console.log(renderCard({ file, payload, apiUrl }))

    if (!answer && saved === 'always') answer = 'always'
    if (!answer && process.stdin.isTTY) answer = await askOnTerminal()
    if (!answer) {
      console.log(
        `[fabric] not sent. Ask the user whether to send it (yes / no / always / never), then run: pikku fabric report ${file} --consent <answer>`
      )
      return { sent: false, reason: 'unanswered', needsConsent: true }
    }

    if ((answer === 'always' || answer === 'never') && answer !== saved) {
      await saveConsent(answer)
    }
    if (answer === 'no' || answer === 'never') {
      console.log(
        answer === 'never'
          ? '[fabric] not sent, and reporting is now off'
          : '[fabric] not sent'
      )
      return { sent: false, reason: answer, needsConsent: false }
    }

    const result = await postReport({ apiUrl, payload })
    if (!result.sent) {
      console.log(`[fabric] could not send the report (${result.reason})`)
      return { sent: false, reason: result.reason, needsConsent: false }
    }
    console.log('[fabric] report sent — thank you')
    return { sent: true, needsConsent: false }
  },
})
