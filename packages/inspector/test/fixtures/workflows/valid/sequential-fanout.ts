/**
 * Valid simple workflow with sequential fanout
 */

import { pikkuSimpleWorkflowFunc } from '@pikku/cli'

interface Member {
  id: string
  email: string
}

interface InvitedMember {
  id: string
  status: string
}

export const sequentialInviteWorkflow = pikkuSimpleWorkflowFunc<
  { members: Member[]; delayBetweenMs: number },
  { invitedCount: number }
>(async ({ workflow }, data) => {
  const invitedMembers: InvitedMember[] = []

  for (const member of data.members) {
    await workflow.do(`Invite member ${member.id}`, 'inviteMember', {
      id: member.id,
    })

    if (data.delayBetweenMs > 0) {
      await workflow.sleep(
        `Wait after invitation for member ${member.id}`,
        `${data.delayBetweenMs}ms`
      )
    }
  }

  return {
    invitedCount: invitedMembers.length,
  }
})
