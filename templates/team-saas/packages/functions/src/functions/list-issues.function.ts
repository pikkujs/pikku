import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { isOrgMember } from '../permissions.js'

export const ListIssuesInput = z.object({
  orgId: z.string(),
  projectId: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'done', 'closed']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
})

export const ListIssuesOutput = z.object({
  issues: z.array(
    z.object({
      issueId: z.string(),
      number: z.number(),
      title: z.string(),
      status: z.string(),
      priority: z.string(),
      projectKey: z.string(),
      assigneeId: z.string().nullable(),
    })
  ),
})

// @snippet start readFunction
export const listIssues = pikkuFunc({
  expose: true,
  readonly: true,
  description: 'List issues in an organisation, newest first.',
  input: ListIssuesInput,
  output: ListIssuesOutput,
  // Both halves, and both are required.
  //
  // The scope says this caller is the kind of person who reads issues. The
  // permission says these are their organisation's issues. Drop the scope and
  // a viewer-only integration could read; drop the permission and any customer
  // could read every other customer's backlog by guessing an orgId.
  scopes: ['issues:read'],
  permissions: {
    member: isOrgMember,
  },
  func: async ({ kysely }, { orgId, projectId, status, limit }) => {
    let query = kysely
      .selectFrom('issue')
      .innerJoin('project', 'project.projectId', 'issue.projectId')
      .select([
        'issue.issueId',
        'issue.number',
        'issue.title',
        'issue.status',
        'issue.priority',
        'issue.assigneeId',
        'project.key as projectKey',
      ])
      // The tenant filter is in the query as well as the permission. The
      // permission decides whether the caller may run this at all; the filter
      // decides what comes back. A permission alone would return every
      // organisation's rows to a legitimate member of one of them.
      .where('issue.orgId', '=', orgId)
      .orderBy('issue.createdAt', 'desc')
      .limit(limit)

    if (projectId) query = query.where('issue.projectId', '=', projectId)
    if (status) query = query.where('issue.status', '=', status)

    return { issues: await query.execute() }
  },
})
// @snippet end readFunction
