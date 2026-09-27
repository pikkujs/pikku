import { pikkuFunc } from '#pikku/addon/function'
import { verifyScopes } from '@pikku/core/scope'
import {
  isPerson,
  PLATFORM_USER_ID,
  SYNTHETIC_MARKERS,
} from '../lib/is-person.js'
import { ListUsersInput, ListUsersOutput } from '../lib/user.schemas.js'

/** Rows read per marker when gathering synthetic ids. */
const SYNTHETIC_CEILING = 1000

/**
 * The ids that are not people, so the query itself can exclude them.
 *
 * They are gathered by id rather than excluded with `actor != true`, because
 * both marker columns are declared `required: false`: a host whose migration
 * left them nullable stores NULL for every ordinary user, and `column != true`
 * is NULL for a NULL column — not true, so SQL drops the row and the directory
 * comes back empty. A primary key is never NULL, so `id NOT IN (...)` is safe
 * on any schema.
 */
const syntheticIds = async (ctx: any): Promise<string[]> => {
  // The platform principal exists as soon as a singleton credential is linked
  // and never goes away afterwards, so it is cheaper to always exclude it than
  // to ask whether it is there.
  const ids = new Set<string>([PLATFORM_USER_ID])
  const declared = ctx.tables?.user?.fields ?? {}

  for (const marker of SYNTHETIC_MARKERS) {
    if (!(marker in declared)) {
      continue
    }
    const rows = (await ctx.adapter.findMany({
      model: 'user',
      where: [{ field: marker, operator: 'eq', value: true }],
      select: ['id'],
      limit: SYNTHETIC_CEILING,
    })) as Array<{ id: string }>
    for (const row of rows) {
      ids.add(row.id)
    }
  }

  return [...ids]
}

export const listUsers = pikkuFunc({
  title: 'List Users',
  description:
    'Lists and searches the user directory, read through the auth adapter so it works on any database better-auth supports. Newest first, paged with `limit` and `offset`.',
  expose: true,
  scopes: ['admin:users:list'],
  input: ListUsersInput,
  output: ListUsersOutput,
  func: async (
    { auth, scopeService },
    { search, limit, offset, includeRoles },
    { session }
  ) => {
    if (!auth) {
      return { users: [], total: 0 }
    }

    // Checked here rather than declared on the function, so that asking for the
    // directory alone does not require a scope only the roles need.
    if (includeRoles) {
      verifyScopes(['admin:scopes:read'], session)
    }

    const ctx = await (await auth()).$context
    const where: any[] = search
      ? [{ field: 'email', operator: 'contains', value: search }]
      : []
    where.push({
      field: 'id',
      operator: 'not_in',
      value: await syntheticIds(ctx),
    })

    const [rows, total] = await Promise.all([
      ctx.adapter.findMany({
        model: 'user',
        where,
        limit: limit ?? 200,
        offset: offset ?? 0,
        // Paging over an unordered result means nothing: without a stable sort
        // the second page is drawn from a different arrangement than the first.
        sortBy: { field: 'createdAt', direction: 'desc' },
      }) as Promise<any[]>,
      ctx.adapter.count({ model: 'user', where }),
    ])

    // A floor under the query: a host with more than SYNTHETIC_CEILING marked
    // rows loses a page slot to one the gather missed, rather than showing a
    // service principal in a people-picker.
    const users = rows.filter(isPerson)

    const roles =
      includeRoles && scopeService
        ? await scopeService.listRolesForUsers(users.map((row) => row.id))
        : undefined

    // `returned: false` marks a column that must not leave the server, and
    // reading the adapter directly bypasses where better-auth normally applies
    // it.
    const additionalFields = Object.entries(
      (ctx.options?.user?.additionalFields ?? {}) as Record<string, any>
    )
      .filter(([, attribute]) => attribute?.returned !== false)
      .map(([name]) => name)

    return {
      users: users.map((row) => {
        const fields: Record<string, unknown> = {}
        for (const name of additionalFields) {
          if (row[name] !== undefined && row[name] !== null) {
            fields[name] = row[name]
          }
        }

        return {
          id: row.id,
          email: row.email,
          name: row.name ?? undefined,
          image: row.image ?? undefined,
          createdAt: row.createdAt
            ? new Date(row.createdAt).toISOString()
            : undefined,
          banned: typeof row.banned === 'boolean' ? row.banned : undefined,
          banReason: row.banReason ?? undefined,
          banExpires: row.banExpires
            ? new Date(row.banExpires).toISOString()
            : undefined,
          roles: roles ? (roles[row.id] ?? []) : undefined,
          fields: Object.keys(fields).length > 0 ? fields : undefined,
        }
      }),
      total,
    }
  },
})
