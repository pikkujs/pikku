import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'
import { WrongCompanyError } from '../../errors.js'

export const DraftQuoteInput = z.object({
  jobId: z.string(),
  amountCents: z.number().int().min(0),
  summary: z.string().min(3).max(500),
})

export const DraftQuoteOutput = z.object({
  quoteId: z.string(),
  status: z.string(),
  needsApproval: z.boolean(),
})

/**
 * Where the money threshold lives.
 *
 * A number in the code rather than a config knob, because changing it is a
 * decision somebody should have to make in a pull request. Anything at or over
 * this goes to a person before it reaches the customer.
 */
export const APPROVAL_THRESHOLD_CENTS = 50_000

export const draftQuote = pikkuFunc({
  expose: true,
  description: 'Draft a quote against a job.',
  input: DraftQuoteInput,
  output: DraftQuoteOutput,
  // The technician who is standing in the plant room drafts it. Approving it
  // is `quotes:approve`, which they do not hold — see roles.ts.
  scopes: ['quotes:create'],
  node: { displayName: 'Draft Quote', category: 'Quotes', type: 'trigger' },
  func: async ({ kysely }, { jobId, amountCents, summary }, { session }) => {
    const companyId = await currentCompanyId(kysely, session.userId)

    const job = await kysely
      .selectFrom('job')
      .select('jobId')
      .where('jobId', '=', jobId)
      .where('companyId', '=', companyId)
      .executeTakeFirst()
    if (!job) throw new WrongCompanyError()

    const needsApproval = amountCents >= APPROVAL_THRESHOLD_CENTS
    const quoteId = randomUUID()

    await kysely
      .insertInto('quote')
      .values({
        quoteId,
        companyId,
        jobId,
        amountCents,
        summary,
        status: needsApproval ? 'awaiting_approval' : 'approved',
        approvedBy: null,
        decidedAt: needsApproval ? null : new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
      .execute()

    return {
      quoteId,
      status: needsApproval ? 'awaiting_approval' : 'approved',
      needsApproval,
    }
  },
})
