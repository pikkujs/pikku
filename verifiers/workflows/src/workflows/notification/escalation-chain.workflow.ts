/**
 * Escalation Chain Workflow
 * Demonstrates notification escalation with retries
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Escalation chain workflow: notify, wait for response, escalate if no response
 */
export const escalationChainWorkflow = pikkuWorkflowComplexFunc<
  {
    alertTitle: string
    alertMessage: string
    escalationLevels: Array<{ userId: string; waitTime: string; level: number }>
  },
  { escalatedTo: string | null; finalLevel: number }
>(async (_services, data, { workflow }) => {
  let escalatedTo: string | null = null
  let finalLevel = 0

  for (const level of data.escalationLevels) {
    finalLevel = level.level

    // Send notification
    await workflow.do(
      `Notify level ${level.level}: ${level.userId}`,
      'notifyEmail',
      {
        userId: level.userId,
        subject: `[Level ${level.level}] ${data.alertTitle}`,
        body: data.alertMessage,
      }
    )

    // Also send push for urgency
    await workflow.do(`Push level ${level.level}`, 'notifyPush', {
      userId: level.userId,
      title: data.alertTitle,
      body: data.alertMessage,
      data: { escalationLevel: String(level.level) },
    })

    // Wait for response
    await workflow.sleep(
      `Wait for response from ${level.userId}`,
      level.waitTime
    )

    escalatedTo = level.userId
  }

  // Final notification about resolution
  await workflow.do('Notify resolution', 'notifySlack', {
    channel: '#alerts',
    message: `Alert "${data.alertTitle}" escalated to level ${finalLevel}`,
  })

  return { escalatedTo, finalLevel }
})
