import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'

export const QuoteStatus = z.enum([
  'draft',
  'awaiting_approval',
  'approved',
  'rejected',
])

export const ListQuotesInput = z.object({
  status: QuoteStatus.optional(),
})

export const ListQuotesOutput = z.object({
  quotes: z.array(
    z.object({
      quoteId: z.string(),
      jobId: z.string(),
      jobTitle: z.string(),
      amountCents: z.number(),
      summary: z.string(),
      status: QuoteStatus,
      createdAt: z.string(),
    })
  ),
})

export const listQuotes = pikkuFunc({
  expose: true,
  description: 'List quotes raised in this company.',
  input: ListQuotesInput,
  output: ListQuotesOutput,
  scopes: ['quotes:read'],
  func: async ({ kysely }, { status }, { session }) => {
    const companyId = await currentCompanyId(kysely, session.userId)
    let query = kysely
      .selectFrom('quote')
      .innerJoin('job', 'job.jobId', 'quote.jobId')
      .select([
        'quote.quoteId',
        'quote.jobId',
        'quote.amountCents',
        'quote.summary',
        'quote.status',
        'quote.createdAt',
        'job.title as jobTitle',
      ])
      .where('quote.companyId', '=', companyId)
      .orderBy('quote.createdAt', 'desc')
    if (status) query = query.where('quote.status', '=', status)
    return { quotes: await query.execute() }
  },
})
