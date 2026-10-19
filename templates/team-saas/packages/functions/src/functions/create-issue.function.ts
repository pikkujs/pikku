import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { randomUUID } from 'node:crypto'
import { isOrgMember } from '../permissions.js'

export const CreateIssueInput = z.object({
  orgId: z.string(),
  projectId: z.string(),
  title: z.string().min(1),
  body: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
})

export const CreateIssueOutput = z.object({
  issueId: z.string(),
  number: z.number(),
})

// @snippet start writeFunction
export const createIssue = pikkuFunc({
  expose: true,
  description: 'Raise an issue in a project.',
  input: CreateIssueInput,
  output: CreateIssueOutput,
  scopes: ['issues:create'],
  permissions: {
    member: isOrgMember,
  },
  audit: true,
  func: async ({ kysely }, { orgId, projectId, title, body, priority }, { session }) => {
    // The project is re-read under the tenant filter rather than trusted from
    // the input. Otherwise a member of org A could pass their own orgId with a
    // projectId belonging to org B, pass the membership check, and file an
    // issue into somebody else's project.
    const project = await kysely
      .selectFrom('project')
      .select(['projectId'])
      .where('projectId', '=', projectId)
      .where('orgId', '=', orgId)
      .executeTakeFirst()

    if (!project) throw new Error('Project not found')

    const [{ next } = { next: 0 }] = await kysely
      .selectFrom('issue')
      .select((eb) => eb.fn.max('number').as('next'))
      .where('projectId', '=', projectId)
      .execute()

    const number = Number(next ?? 0) + 1
    const issueId = randomUUID()

    await kysely
      .insertInto('issue')
      .values({
        issueId,
        orgId,
        projectId,
        number,
        title,
        body: body ?? null,
        priority,
        status: 'open',
        createdBy: session.userId,
      })
      .execute()

    return { issueId, number }
  },
})
// @snippet end writeFunction
