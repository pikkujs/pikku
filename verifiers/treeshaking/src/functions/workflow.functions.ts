import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const notificationWorkflow = pikkuWorkflowFunc<
  { to: string; subject: string; body: string },
  { sent: boolean }
>({
  disabled: 'no callers found, 2026-10-20',
  func: async ({}, data, { workflow }) => {
    await workflow.do('Send notification email', 'sendEmail', data)
    return { sent: true }
  },
})
