import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const notificationWorkflow = pikkuWorkflowFunc<
  { to: string; subject: string; body: string },
  { sent: boolean }
>({
  func: async ({}, data, { workflow }) => {
    await workflow.do('Send notification email', 'sendEmail', data)
    return { sent: true }
  },
})
