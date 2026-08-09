import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { z } from 'zod'

const managerDecision = z.object({
  approved: z.boolean(),
  reviewer: z.string(),
})

/**
 * Employee onboarding: the flow that spends most of its life not running.
 *
 * It combines the three ways a DSL workflow gives up its process — a timer
 * (`sleep`), a human gate (`approval`), and an explicit hold (`suspend`) — so
 * that a single run can be interrupted at three structurally different kinds
 * of wait. Each is durable for a different reason, and a restart during each
 * exercises a different recovery path.
 */
export const chaosOnboardingWorkflow = pikkuWorkflowFunc<
  {
    employeeId: string
    /** How long the provisioning timer holds the run. */
    settleFor?: string
    /** Hold the run open for an external resume before the manager gate. */
    holdForResume?: boolean
    /** Give up on the manager if nobody answers within this long. */
    approvalExpiry?: string
    provisionDelayMs?: number
  },
  {
    employeeId: string
    provisioned: boolean
    outcome: 'active' | 'expired' | 'rejected'
    reviewer?: string
  }
>({
  func: async ({}, data, { workflow }) => {
    await workflow.do('Create account', 'chaosStep', {
      key: `account:${data.employeeId}`,
      echo: data.employeeId,
    })

    const provisioned = await workflow.do('Provision laptop', 'chaosStep', {
      key: `laptop:${data.employeeId}`,
      delayMs: data.provisionDelayMs,
      echo: data.employeeId,
    })

    await workflow.sleep('Settle provisioning', data.settleFor ?? '2s')

    if (data.holdForResume) {
      await workflow.suspend(`Hold onboarding for ${data.employeeId}`)
    }

    const decision = await workflow.approval(
      `Manager sign-off for ${data.employeeId}`,
      { schema: managerDecision, expiry: data.approvalExpiry }
    )

    if (decision.status === 'expired') {
      await workflow.do('Revoke on expiry', 'chaosCompensate', {
        key: `account:${data.employeeId}`,
      })
      return {
        employeeId: data.employeeId,
        provisioned: provisioned.totalEffects > 0,
        outcome: 'expired',
      }
    }

    if (!decision.data.approved) {
      await workflow.do('Revoke on rejection', 'chaosCompensate', {
        key: `account:${data.employeeId}`,
      })
      return {
        employeeId: data.employeeId,
        provisioned: provisioned.totalEffects > 0,
        outcome: 'rejected',
        reviewer: decision.data.reviewer,
      }
    }

    await workflow.do('Grant access', 'chaosStep', {
      key: `access:${data.employeeId}`,
      echo: data.employeeId,
    })

    return {
      employeeId: data.employeeId,
      provisioned: provisioned.totalEffects > 0,
      outcome: 'active',
      reviewer: decision.data.reviewer,
    }
  },
  tags: ['chaos', 'approval'],
})
