import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Workflow that calls the OAuth API addon to verify credentials
 * are propagated through workflow steps via pikkuUserId.
 */
export const credentialWorkflow = pikkuWorkflowFunc<
  {},
  { authenticated: boolean; token: string }
>(async ({}, _data, { workflow }) => {
  const profile = await workflow.do(
    'Get OAuth profile',
    'oauth-api:getProfile',
    {}
  )
  return {
    authenticated: profile.authenticated,
    token: profile.token,
  }
})
