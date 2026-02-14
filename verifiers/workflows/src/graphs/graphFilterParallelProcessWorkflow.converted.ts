import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphFilterParallelProcessWorkflow = pikkuWorkflowGraph({
  name: 'graphFilterParallelProcessWorkflow',
  nodes: {
    send_to_email: 'emailSend',
    log_invalid_emails: 'notifySlack',
  },
  config: {
    send_to_email: {
      input: (ref, template) => ({
        to: ref('$item', 'email'),
        subject: 'Welcome',
        body: 'Thank you for subscribing!',
      }),
    },
    log_invalid_emails: {
      input: (ref, template) => ({
        channel: '#email-issues',
        message: template('$0 invalid emails found', [ref('step_1', 'length')]),
      }),
    },
  },
})
