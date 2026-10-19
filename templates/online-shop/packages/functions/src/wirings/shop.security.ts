import { pikkuAuth, pikkuPermission } from '#pikku/auth'

// @snippet start shopIsAuthenticated
export const isAuthenticated = pikkuAuth(
  async (_services, session) => !!session
)
// @snippet end shopIsAuthenticated

// @snippet start shopIsOrderOwner
// @snippet start permissionFunction
export const isOrderOwner = pikkuPermission(
  async ({ kysely }, { orderId }: { orderId: string }, { session }) => {
    const order = await kysely
      .selectFrom('order')
      .select('userId')
      .where('orderId', '=', orderId)
      .executeTakeFirst()
    return order?.userId === session?.userId
  }
)
// @snippet end permissionFunction
// @snippet end shopIsOrderOwner

// @snippet start permissionsCompact
// scopes: ['orders:cancel']            AND — every scope required
// permissions: { owner: isOrderOwner } OR  — any key may pass
// @snippet end permissionsCompact

// Scopes and permissions answer different questions, and run in that order.
//
// `scopes` is what the *role* entitles you to, checked first and AND-ed: hold
// every one or the call never reaches the function. It is narrowed to the
// generated `ScopeId` union, so a typo is a compile error rather than a gate
// that silently never matches.
//
// `permissions` is what is true of *this row*, OR-ed across keys. No scope can
// express "your own order", because that depends on the data.
//
// A scope can only narrow access — it cannot grant what a permission refuses.
// See cancel-order.function.ts for the pair used together on a real function.
