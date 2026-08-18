import { pikkuFunc } from '#pikku/addon/function'
import { isPerson } from '../lib/is-person.js'
import { ListUsersInput, ListUsersOutput } from '../lib/user.schemas.js'

export const listUsers = pikkuFunc({
  title: 'List Users',
  description:
    'Lists and searches the user directory, read through the auth adapter so it works on any database better-auth supports.',
  expose: true,
  scopes: ['admin:users:list'],
  input: ListUsersInput,
  output: ListUsersOutput,
  func: async ({ auth }, { search, limit }) => {
    if (!auth) {
      return { users: [] }
    }
    const ctx = await (await auth()).$context
    const rows = (await ctx.adapter.findMany({
      model: 'user',
      limit: limit ?? 200,
      where: search
        ? [{ field: 'email', operator: 'contains', value: search }]
        : undefined,
    })) as any[]

    return {
      users: rows.filter(isPerson).map((row) => ({
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
      })),
    }
  },
})
