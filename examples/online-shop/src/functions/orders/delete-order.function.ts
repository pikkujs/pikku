import { pikkuFunc } from '#pikku/function'

// @snippet start scopedFunction
// Administration is a scope, not a string comparison against a column. The old
// `session.role === 'admin'` shape could not be checked at build time, could
// not be granted through the console, and said nothing about *which* admin
// capability was needed.
//
// Defined here rather than beside its `wireHTTP` call: a file that both defines
// a function and wires it yields "metadata not found" from the inspector, and
// the wiring is skipped at startup. `DELETE /orders/:orderId` was wired,
// documented, and absent from the running server for exactly that reason.
export const deleteOrder = pikkuFunc({
  func: async ({ kysely }, { orderId }: { orderId: string }) => {
    await kysely.deleteFrom('order').where('orderId', '=', orderId).execute()
  },
  scopes: ['orders'],
})
// @snippet end scopedFunction
