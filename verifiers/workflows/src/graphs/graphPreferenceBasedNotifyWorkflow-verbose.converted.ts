import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphPreferenceBasedNotifyWorkflow = pikkuWorkflowGraph({
  name: 'graphPreferenceBasedNotifyWorkflow',
  tags: ['notification'],
  nodes: {
    get_preferences: 'notificationPreferencesGet',
    send_email_notification: 'notifyEmail',
    send_sms_notification: 'notifySMS',
    send_push_notification: 'notifyPush',
    send_slack_notification: 'notifySlack',
  },
  config: {
    get_preferences: {
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
      }),
    },
    send_email_notification: {
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        subject: ref('trigger', 'title'),
        body: ref('trigger', 'message'),
      }),
    },
    send_sms_notification: {
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        message: ref('trigger', 'message'),
      }),
    },
    send_push_notification: {
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        title: ref('trigger', 'title'),
        body: ref('trigger', 'message'),
      }),
    },
    send_slack_notification: {
      input: (ref, template) => ({
        channel: template('#user-$0', [ref('trigger', 'userId')]),
        message: template('$0: $1', [
          ref('trigger', 'title'),
          ref('trigger', 'message'),
        ]),
      }),
    },
  },
})
