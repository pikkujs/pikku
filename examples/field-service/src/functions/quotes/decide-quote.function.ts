import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'
import { QuoteAlreadyDecidedError, WrongCompanyError } from '../../errors.js'

export const DecideQuoteInput = z.object({
  quoteId: z.string(),
  approve: z.boolean(),
})

export const DecideQuoteOutput = z.object({
  quoteId: z.string(),
  status: z.enum(['approved', 'rejected']),
})

export const decideQuote = pikkuFunc({
  expose: true,
  description: 'Approve or reject a quote that is waiting on a person.',
  input: DecideQuoteInput,
  output: DecideQuoteOutput,
  scopes: ['quotes:approve'],
  node: { displayName: 'Decide Quote', category: 'Quotes', type: 'end' },
  func: async ({ kysely, auditLog }, { quoteId, approve }, { session }) => {
    const companyId = await currentCompanyId(kysely, session.userId)

    const quote = await kysely
      .selectFrom('quote')
      .select(['quoteId', 'status'])
      .where('quoteId', '=', quoteId)
      .where('companyId', '=', companyId)
      .executeTakeFirst()

    if (!quote) throw new WrongCompanyError()
    // A second approval is not idempotent — it would overwrite who decided and
    // when, which is the part anybody ever looks back at.
    if (quote.status !== 'awaiting_approval') {
      throw new QuoteAlreadyDecidedError()
    }

    const status = approve ? ('approved' as const) : ('rejected' as const)
    await kysely
      .updateTable('quote')
      .set({
        status,
        approvedBy: session.userId,
        decidedAt: new Date().toISOString(),
      })
      .where('quoteId', '=', quoteId)
      .execute()

    await auditLog.write({
      type: 'quote.decided',
      source: 'explicit',
      metadata: { quoteId, status, decidedBy: session.userId },
    })

    return { quoteId, status }
  },
})
