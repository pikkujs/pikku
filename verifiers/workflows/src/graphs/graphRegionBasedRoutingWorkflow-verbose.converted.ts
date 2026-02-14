import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphRegionBasedRoutingWorkflow = pikkuWorkflowGraph({
  name: 'graphRegionBasedRoutingWorkflow',
  tags: ['patterns'],
  nodes: {
    configure_us_settings: 'profileSetup',
    configure_eu_settings: 'profileSetup',
    apply_gdpr_settings: 'taskCreate',
    configure_apac_settings: 'profileSetup',
    configure_latam_settings: 'profileSetup',
    notify_regional_support: 'notifySlack',
  },
  config: {
    configure_us_settings: {
      next: 'notify_regional_support',
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        timezone: 'America/New_York',
      }),
    },
    configure_eu_settings: {
      next: 'apply_gdpr_settings',
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        timezone: 'Europe/London',
      }),
    },
    apply_gdpr_settings: {
      next: 'notify_regional_support',
      input: (ref, template) => ({
        title: template('GDPR compliance check for $0', [
          ref('trigger', 'userId'),
        ]),
      }),
    },
    configure_apac_settings: {
      next: 'notify_regional_support',
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        timezone: 'Asia/Singapore',
      }),
    },
    configure_latam_settings: {
      next: 'notify_regional_support',
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        timezone: 'America/Sao_Paulo',
      }),
    },
    notify_regional_support: {
      input: (ref, template) => ({
        channel: template('#$0', [ref('trigger', 'supportTeam')]),
        message: template('New user $0 assigned to $1', [
          ref('trigger', 'userId'),
          ref('trigger', 'datacenter'),
        ]),
      }),
    },
  },
})
