import { z } from 'zod'
import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuFunc } from '#pikku/function'
import { wireHTTP } from '#pikku/http'

/**
 * The decision payload.
 *
 * A VALUE, not a type generic. The payload arrives over the approve wire from a
 * caller the workflow has never met, and a generic is erased at compile time —
 * it would validate nothing at all.
 */
const QuoteDecision = z.object({
  approve: z.boolean(),
  note: z.string().max(500).optional(),
})

/**
 * A quote above the threshold waits for a person.
 *
 * The input parameter is a plain `data` identifier rather than a destructured
 * `{ quoteId }`. The DSL reads the workflow's shape out of the source to build
 * the step graph, and it can only follow the input through a name it can see —
 * destructuring it in the signature fails generation with PKU641.
 *
 * `approvers: 'not-initiator'` is the whole reason this is a workflow rather
 * than two RPCs: the technician who drafted the number cannot be the one who
 * signs it off, and that has to hold even when the same person is a dispatcher
 * on paper. `approverScope` narrows the second pair of eyes to a senior pair.
 *
 * The gate is durable. A run waits three days across restarts, deploys and a
 * dispatcher's holiday, and `expiry` is evaluated from a recorded deadline on
 * replay — so an expired gate is still correct if the wake-up timer was never
 * delivered.
 */
export const quoteApprovalWorkflow = pikkuWorkflowFunc<
  { quoteId: string },
  { quoteId: string; outcome: 'approved' | 'rejected' | 'expired' }
>({
  func: async (_services, data, { workflow, rpc }) => {
    const decision = await workflow.approval(`Approve quote ${data.quoteId}`, {
      schema: QuoteDecision,
      approvers: 'not-initiator',
      approverScope: 'quotes:approve',
      expiry: '3d',
    })

    if (decision.status === 'expired') {
      return { quoteId: data.quoteId, outcome: 'expired' as const }
    }

    // The gate says a human answered. Whether the answer was yes is the
    // application's business, and `decideQuote` is where it is recorded —
    // reusing the same RPC a dispatcher hits from the screen, so there is one
    // code path that decides a quote rather than two that drift.
    const result = await workflow.do('Record the decision', 'decideQuote', {
      quoteId: data.quoteId,
      approve: decision.data.approve,
    })

    await rpc.invoke('noticeQuoteDecided', {
      quoteId: data.quoteId,
      status: result.status,
    })

    return { quoteId: data.quoteId, outcome: result.status }
  },
})

export const noticeQuoteDecided = pikkuFunc({
  description: 'Announce a settled quote on the company board.',
  func: async (
    { kysely, eventHub, logger },
    { quoteId, status }: { quoteId: string; status: string }
  ) => {
    const quote = await kysely
      .selectFrom('quote')
      .select(['companyId', 'jobId'])
      .where('quoteId', '=', quoteId)
      .executeTakeFirst()
    if (!quote) return

    await eventHub?.publish(`board:${quote.companyId}`, null, {
      type: 'quote.decided',
      quoteId,
      jobId: quote.jobId,
      status,
    })
    logger.info({ event: 'quote_decided', quoteId, status })
  },
})

/**
 * The way in.
 *
 * A workflow cannot be invoked over RPC — `workflow.approval` is undefined
 * outside a run — so a gate with no entry point is a gate nobody can reach.
 */
export const startQuoteApproval = pikkuFunc({
  expose: true,
  description: 'Send a drafted quote to a dispatcher for sign-off.',
  scopes: ['quotes:create'],
  func: async ({}, { quoteId }: { quoteId: string }, { rpc }) => {
    return rpc.startWorkflow('quoteApprovalWorkflow', { quoteId })
  },
})

wireHTTP({
  method: 'post',
  route: '/quotes/:quoteId/approval',
  func: startQuoteApproval,
  auth: true,
})
