/**
 * Valid simple workflow example from the proposal
 */

import { pikkuSimpleWorkflowFunc } from '@pikku/cli'

interface Owner {
  id: string
  email: string
}

interface Org {
  id: string
  name: string
}

export const orgOnboardingWorkflow = pikkuSimpleWorkflowFunc<
  { email: string; plan: string; memberEmails: string[] },
  { orgId: string; ownerId?: string }
>(async ({ workflow }, data) => {
  // Step 1: Create organization
  const org = await workflow.do('Create organization', 'createOrg', {
    name: data.email.split('@')[1],
  })

  // Step 2: Conditional owner creation
  let owner: Owner | undefined
  if (data.plan === 'enterprise') {
    owner = await workflow.do(
      'Create owner',
      'createOwner',
      { orgId: org.id, email: data.email },
      { retries: 3, retryDelay: '5s' }
    )
  }

  // Step 3: Parallel member invitations
  await Promise.all(
    data.memberEmails.map((email) =>
      workflow.do('Invite member', 'inviteMember', { orgId: org.id, email })
    )
  )

  // Step 4: Send welcome email
  await workflow.do('Send welcome email', 'sendEmail', {
    to: data.email,
    subject: 'Welcome to Pikku!',
    body: `Your org ${org.id} is ready`,
  })

  return {
    orgId: org.id,
    ownerId: owner?.id,
  }
})
