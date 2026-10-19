import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { canWriteIssue } from '../permissions.js'

export const CloseIssueInput = z.object({
  issueId: z.string(),
  resolution: z.enum(['done', 'closed']).default('done'),
})

export const CloseIssueOutput = z.object({
  issueId: z.string(),
  status: z.string(),
})

// @snippet start scopedFunction
export const closeIssue = pikkuFunc({
  expose: true,
  description: 'Close an issue, or mark it done.',
  input: CloseIssueInput,
  output: CloseIssueOutput,
  scopes: ['issues:close'],
  // `canWriteIssue` resolves the organisation from the issue itself rather than
  // from anything the caller supplied. That matters: a caller who sends their
  // own orgId alongside somebody else's issueId would pass a naive membership
  // check, and this shape cannot be fooled that way.
  //
  // Note that `support` deliberately holds no `issues:close` scope, so it fails
  // here on the first gate — your own staff can read a customer's workspace to
  // diagnose it and cannot act inside it.
  permissions: {
    writer: canWriteIssue,
  },
  audit: true,
  func: async ({ kysely, eventHub, queueService}, { issueId, resolution }) => {
    const issue = await kysely
      .selectFrom('issue')
      .select(['issueId', 'orgId', 'status'])
      .where('issueId', '=', issueId)
      .executeTakeFirstOrThrow()

    if (issue.status === resolution) {
      // The audit worker was wired to a queue nothing pushed to. This is the kind
      // of change it exists for: deliberate, human, and leaving no row of its own
      // that explains who did it.
      await queueService
        ?.add('audit-event', { entityType: 'issue', entityId: issueId, action: 'closed' })
        .catch(() => undefined)

      return { issueId, status: issue.status }
    }

    await kysely
      .updateTable('issue')
      .set({ status: resolution, updatedAt: new Date().toISOString() })
      .where('issueId', '=', issueId)
      .execute()

    // Published per organisation, so a board open in one tenant never receives
    // another tenant's events.
    await eventHub?.publish(`org:${issue.orgId}`, null, {
      type: 'issue-closed',
      issueId,
      status: resolution,
    })

    return { issueId, status: resolution }
  },
})
// @snippet end scopedFunction
