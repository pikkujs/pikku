import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const dslBranchingWorkflow = pikkuWorkflowFunc<
  { score: number; name: string },
  { path: string; message: string }
>(async ({}, data, { workflow }) => {
  let path = 'standard'
  let message = ''
  let formatted: { message: string }

  if (data.score >= 70) {
    formatted = await workflow.do('Premium message', 'formatMessage', {
      greeting: 'Congratulations',
      name: data.name,
    })
    await workflow.do('Premium notification', 'sendNotification', {
      to: data.name,
      subject: 'Premium',
      body: formatted.message,
    })
    path = 'premium'
    message = formatted.message
  } else {
    formatted = await workflow.do('Standard message', 'formatMessage', {
      greeting: 'Thank you',
      name: data.name,
    })
    path = 'standard'
    message = formatted.message
  }

  return { path, message }
})
