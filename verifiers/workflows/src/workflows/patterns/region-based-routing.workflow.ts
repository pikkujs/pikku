/**
 * Region-based routing workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const regionBasedRoutingWorkflow = pikkuWorkflowFunc<
  { region: 'us' | 'eu' | 'apac' | 'latam'; userId: string },
  { datacenter: string; supportTeam: string; timezone: string }
>(async (_services, data, { workflow }) => {
  let datacenter: string
  let supportTeam: string
  let timezone: string

  switch (data.region) {
    case 'us':
      datacenter = 'us-east-1'
      supportTeam = 'us-support'
      timezone = 'America/New_York'
      await workflow.do('Configure US settings', 'profileSetup', {
        userId: data.userId,
        timezone: 'America/New_York',
      })
      break

    case 'eu':
      datacenter = 'eu-west-1'
      supportTeam = 'eu-support'
      timezone = 'Europe/London'
      await workflow.do('Configure EU settings', 'profileSetup', {
        userId: data.userId,
        timezone: 'Europe/London',
      })
      // EU requires GDPR compliance
      await workflow.do('Apply GDPR settings', 'taskCreate', {
        title: `GDPR compliance check for ${data.userId}`,
      })
      break

    case 'apac':
      datacenter = 'ap-southeast-1'
      supportTeam = 'apac-support'
      timezone = 'Asia/Singapore'
      await workflow.do('Configure APAC settings', 'profileSetup', {
        userId: data.userId,
        timezone: 'Asia/Singapore',
      })
      break

    case 'latam':
      datacenter = 'sa-east-1'
      supportTeam = 'latam-support'
      timezone = 'America/Sao_Paulo'
      await workflow.do('Configure LATAM settings', 'profileSetup', {
        userId: data.userId,
        timezone: 'America/Sao_Paulo',
      })
      break

    default:
      datacenter = 'us-east-1'
      supportTeam = 'global-support'
      timezone = 'UTC'
  }

  // Notify support team about new user
  await workflow.do('Notify regional support', 'notifySlack', {
    channel: `#${supportTeam}`,
    message: `New user ${data.userId} assigned to ${datacenter}`,
  })

  return { datacenter, supportTeam, timezone }
})
