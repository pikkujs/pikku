import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphTimedReminderWorkflow = pikkuWorkflowGraph({
  name: 'graphTimedReminderWorkflow',
  tags: ['notification'],
  nodes: {
    send_reminder_reminderssent_1: 'notifyEmail',
  },
  config: {
    send_reminder_reminderssent_1: {
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        subject: template('Reminder: $0', [ref('trigger', 'reminderTitle')]),
        body: template('$0\n\n(Reminder $1 of $2)', [
          ref('trigger', 'reminderMessage'),
          { $ref: 'remindersSent + 1' } as any,
          { $ref: 'data.intervals.length' } as any,
        ]),
      }),
    },
  },
})
