import { pikkuFunc } from '#pikku'

/**
 * Mirrors `PLATFORM_USER_ID` from `@pikku/better-auth` rather than importing
 * it: this function degrades to an empty directory when no `auth` service is
 * wired, and a value import would make the whole console addon fail at module
 * load in an app that has no better-auth installed.
 */
const PLATFORM_USER_ID = 'pikku-platform'

export type ListedUser = {
  id: string
  email: string
  name?: string
  image?: string
  createdAt?: string
}

const DEFAULT_LIMIT = 200

export const listUsers = pikkuFunc<
  { search?: string; limit?: number },
  { users: ListedUser[] }
>({
  title: 'List Users',
  description:
    'Lists and searches the user directory read from the configured auth adapter.',
  expose: true,
  scopes: ['admin:users:list'],
  func: async ({ auth }, { search, limit }) => {
    if (!auth) {
      return { users: [] }
    }
    const ctx = await (await auth()).$context

    const rows = (await ctx.adapter.findMany({
      model: 'user',
      limit: limit ?? DEFAULT_LIMIT,
      where: search
        ? [{ field: 'email', operator: 'contains', value: search }]
        : undefined,
    })) as any[]

    const users: ListedUser[] = []
    for (const row of rows) {
      // Synthetic principals — the platform credential owner, fabric service
      // users and agent actors — are not people, so they never belong in a
      // directory a human picks from.
      if (row.fabric === true || row.actor === true) {
        continue
      }
      if (row.id === PLATFORM_USER_ID) {
        continue
      }
      users.push({
        id: row.id,
        email: row.email,
        name: row.name ?? undefined,
        image: row.image ?? undefined,
        createdAt: row.createdAt
          ? new Date(row.createdAt).toISOString()
          : undefined,
      })
    }

    return { users }
  },
})
