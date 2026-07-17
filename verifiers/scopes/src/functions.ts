import { pikkuSessionlessFunc } from '#pikku'

/**
 * Every scope below is declared in scopes.ts, so these compile.
 */

export const createInvoice = pikkuSessionlessFunc<void, string>({
  scopes: ['admin:invoices:create'],
  func: async () => 'created',
})

export const readBilling = pikkuSessionlessFunc<void, string>({
  scopes: ['billing:read'],
  func: async () => 'billing',
})

/** Several scopes are AND-ed: the session must hold both. */
export const voidAndRead = pikkuSessionlessFunc<void, string>({
  scopes: ['admin:invoices:void', 'billing:read'],
  func: async () => 'both',
})

/** An intermediate node of a declared tree is itself requirable. */
export const manageInvoices = pikkuSessionlessFunc<void, string>({
  scopes: ['admin:invoices'],
  func: async () => 'manage',
})

/** A wildcard requires the whole subtree. */
export const fullAdmin = pikkuSessionlessFunc<void, string>({
  scopes: ['admin:*'],
  func: async () => 'admin',
})

/** No scopes at all is still valid — the gate is opt-in. */
export const unscoped = pikkuSessionlessFunc<void, string>({
  func: async () => 'open',
})
