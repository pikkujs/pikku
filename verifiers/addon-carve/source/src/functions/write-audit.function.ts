import { pikkuSessionlessFunc } from '#pikku'

// NOT carved into any addon. It touches `auditLog`, so that table exists in the
// source DB but must never leak into the `dbpost` addon's owned set — proving
// the carve scopes to what the carved functions actually use.
export const writeAudit = pikkuSessionlessFunc<{ action: string }, { id: string }>(
  {
    func: async ({ kysely }, { action }) => {
      const row = await kysely
        .insertInto('auditLog')
        .values({ id: action, action, at: action })
        .returning('id')
        .executeTakeFirstOrThrow()
      return { id: row.id }
    },
    expose: true,
  }
)
