import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const dslSequentialWorkflow = pikkuWorkflowFunc<
  { value: number; name: string },
  { doubled: number; message: string; notified: boolean }
>(async ({}, data, { workflow }) => {
  const doubled = await workflow.do('Double value', 'doubleValue', {
    value: data.value,
  })

  const formatted = await workflow.do('Format message', 'formatMessage', {
    greeting: 'Hello',
    name: data.name,
  })

  const notification = await workflow.do(
    'Send notification',
    'sendNotification',
    {
      to: data.name,
      subject: 'Workflow Complete',
      body: formatted.message,
    }
  )

  return {
    doubled: doubled.result,
    message: formatted.message,
    notified: notification.sent,
  }
})
