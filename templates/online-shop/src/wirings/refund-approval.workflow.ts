import { z } from 'zod'
import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku/function'
import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

// @snippet start workflowApprovalGate
/**
 * The schema is a value because the answer arrives from an untrusted caller:
 * it is checked on replay, and a payload that fails it reopens the gate.
 * Saying no is an answer like any other, so `approve` lives in the schema.
 */
const RefundDecision = z.object({
  approve: z.boolean(),
  note: z.string().max(500).optional(),
})

export const RefundApprovalInput = z.object({ orderId: z.string() })
export const RefundApprovalOutput = z.object({
  outcome: z.enum(['refunded', 'declined', 'expired']),
})

export const refundApprovalWorkflow = pikkuWorkflowFunc({
  title: 'Refund Approval',
  tags: ['orders'],
  input: RefundApprovalInput,
  output: RefundApprovalOutput,
  func: async (_services, data, { workflow }) => {
    const decision = await workflow.approval('Manager approves the refund', {
      schema: RefundDecision,
      approvers: 'not-initiator',
      expiry: '3d',
    })

    if (decision.status === 'expired') {
      return { outcome: 'expired' as const }
    }

    if (!decision.data.approve) {
      return { outcome: 'declined' as const }
    }

    await workflow.do('Cancel the order', 'cancelOrder', {
      orderId: data.orderId,
    })

    return { outcome: 'refunded' as const }
  },
})
// @snippet end workflowApprovalGate

export const startRefundApproval = pikkuFunc({
  expose: true,
  description: 'Send a refund to a manager for approval.',
  scopes: ['orders:refund'],
  input: RefundApprovalInput,
  func: async ({}, { orderId }, { rpc }) => {
    return rpc.startWorkflow('refundApprovalWorkflow', { orderId })
  },
})

// @snippet start workflowApprovalAnswer
/**
 * Yes and no take the same path: the payload is the answer, and the workflow
 * branches on it. `reason` is the exact string given to `workflow.approval`,
 * and `session` is what `approvers` and `approverScope` judge. The generated
 * `POST /workflow/:workflowName/approve/:runId` route makes the same call.
 */
export const AnswerRefundInput = RefundDecision.extend({ runId: z.string() })
export const AnswerRefundOutput = z.object({ ok: z.literal(true) })

export const answerRefundApproval = pikkuFunc({
  expose: true,
  description: 'Approve or decline a refund waiting on a manager.',
  scopes: ['orders:refund'],
  input: AnswerRefundInput,
  output: AnswerRefundOutput,
  func: async ({ workflowService }, { runId, approve, note }, { session }) => {
    if (!workflowService) {
      throw new MissingServiceError('workflowService is required')
    }
    await workflowService.approveStep(
      runId,
      'Manager approves the refund',
      { approve, note },
      session
    )
    return { ok: true as const }
  },
})
// @snippet end workflowApprovalAnswer

// @snippet start workflowApprovalsWaiting
/**
 * There is no query for "waiting on an approval". A run at a gate is
 * `suspended`, as is one in a plain `workflow.suspend`, so read its steps: the
 * open gate is the running `pikkuWorkflowApproval` step. `workflowRunService`
 * checks no ownership, so guard the function that exposes it.
 */
export const RefundsAwaitingApproval = z.object({
  waiting: z.array(
    z.object({ runId: z.string(), orderId: z.string(), reason: z.string() })
  ),
})

export const listRefundsAwaitingApproval = pikkuFunc({
  expose: true,
  description: 'List the refunds waiting on a manager.',
  scopes: ['orders:refund'],
  output: RefundsAwaitingApproval,
  func: async ({ workflowRunService }) => {
    if (!workflowRunService) {
      throw new MissingServiceError('workflowRunService is required')
    }
    const runs = await workflowRunService.listRuns({
      workflowName: 'refundApprovalWorkflow',
      status: 'suspended',
      limit: 50,
    })
    const waiting = await Promise.all(
      runs.map(async (run) => {
        const steps = await workflowRunService.getRunSteps(run.id)
        const gate = steps.find(
          (step) =>
            step.rpcName === 'pikkuWorkflowApproval' &&
            step.status === 'running'
        )
        return gate
          ? {
              runId: run.id,
              orderId: run.input.orderId as string,
              reason: gate.data.reason as string,
            }
          : null
      })
    )
    return { waiting: waiting.filter((run) => run !== null) }
  },
})
// @snippet end workflowApprovalsWaiting
