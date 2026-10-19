import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { isOrgMember } from '../permissions.js'

export const ListProjectsInput = z.object({
  orgId: z.string(),
  /** Archived projects are hidden by default — you cannot file new work in one. */
  includeArchived: z.boolean().default(false),
})

export const ListProjectsOutput = z.object({
  projects: z.array(
    z.object({
      projectId: z.string(),
      name: z.string(),
      key: z.string(),
      archived: z.boolean(),
    })
  ),
})

/**
 * The projects of one organisation.
 *
 * `createIssue` requires a `projectId` and nothing in this app ever produced
 * one: the board renders `projectKey` for display, which is a label, not an id.
 * So raising an issue was reachable only from a caller that already knew a
 * project id — which is to say, from a test.
 *
 * Tenant-filtered by `isOrgMember` and by the query, for the same reason
 * `listIssues` is: the permission decides whether the caller may ask at all,
 * the filter decides what comes back.
 */
export const listProjects = pikkuFunc({
  expose: true,
  readonly: true,
  description: 'The projects belonging to an organisation.',
  input: ListProjectsInput,
  output: ListProjectsOutput,
  permissions: {
    member: isOrgMember,
  },
  func: async ({ kysely }, { orgId, includeArchived }) => {
    let query = kysely
      .selectFrom('project')
      .select(['projectId', 'name', 'key', 'archived'])
      .where('orgId', '=', orgId)
      .orderBy('name')

    if (!includeArchived) {
      query = query.where('archived', '=', 0)
    }

    const rows = await query.execute()
    return {
      projects: rows.map((row) => ({
        projectId: row.projectId,
        name: row.name,
        key: row.key,
        archived: Boolean(row.archived),
      })),
    }
  },
})
