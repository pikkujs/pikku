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
    const invited = await workflow.do(
      "Invite member",
      "inviteMember",
      { id: member.id }
    )

    if (data.delayBetweenMs > 0) {
      await workflow.sleep(
        "Wait between invitations",
        `${data.delayBetweenMs}ms`
      )
    }
  }

  return {
    invitedCount: invitedMembers.length
  }
})
