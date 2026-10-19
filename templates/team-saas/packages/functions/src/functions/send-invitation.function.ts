import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const SendInvitationInput = z.object({
  invitationId: z.string(),
})

/**
 * Queued rather than sent inline.
 *
 * Inviting somebody should not fail because a mail provider is slow, and the
 * membership row is the fact that matters — the email is a notification about
 * it. Sessionless because the worker runs it, and therefore carrying no scopes:
 * an anonymous caller holds none and would satisfy none.
 */
// @snippet start queueWorkerFunction
export const sendInvitation = pikkuSessionlessFunc({
  // Exposed so the operations screen can raise one on demand. Otherwise this
  // runs only when something else queues it, and nobody can force it when it
  // matters or prove it still works.
  expose: true,
  description: 'Email an invitation to join an organisation.',
  input: SendInvitationInput,
  func: async ({ kysely, emailService, logger }, { invitationId }) => {
    const invite = await kysely
      .selectFrom('invitation')
      .innerJoin('organisation', 'organisation.orgId', 'invitation.orgId')
      .select([
        'invitation.email',
        'invitation.token',
        'invitation.status',
        'organisation.name as orgName',
      ])
      .where('invitation.invitationId', '=', invitationId)
      .executeTakeFirstOrThrow()

    // Re-check rather than trusting that this is the first delivery: a queue
    // can deliver twice, and an invitation revoked between enqueue and run
    // must not still arrive.
    if (invite.status !== 'pending') {
      logger.info({ event: 'invite_skipped', invitationId, status: invite.status })
      return
    }

    await emailService.send({
      to: invite.email,
      subject: `Join ${invite.orgName}`,
      text: `You have been invited to ${invite.orgName}. Use this token to accept: ${invite.token}`,
    })

    logger.info({ event: 'invite_sent', invitationId })
  },
})
// @snippet end queueWorkerFunction
