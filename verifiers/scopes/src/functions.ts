import { pikkuFunc } from '#pikku/function'

/**
 * Every scope below is declared in scopes.ts, so these compile.
 */

export const createInvoice = pikkuFunc<void, string>({
  disabled: 'no callers found, 2026-10-20',
  scopes: ['admin:invoices:create'],
  func: async () => 'created',
})

export const readBilling = pikkuFunc<void, string>({
  disabled: 'no callers found, 2026-10-20',
  scopes: ['billing:read'],
  func: async () => 'billing',
})

/** Several scopes are AND-ed: the session must hold both. */
export const voidAndRead = pikkuFunc<void, string>({
  disabled: 'no callers found, 2026-10-20',
  scopes: ['admin:invoices:void', 'billing:read'],
  func: async () => 'both',
})

/** An intermediate node of a declared tree is itself requirable. */
export const manageInvoices = pikkuFunc<void, string>({
  disabled: 'no callers found, 2026-10-20',
  scopes: ['admin:invoices'],
  func: async () => 'manage',
})

/** A wildcard requires the whole subtree. */
export const fullAdmin = pikkuFunc<void, string>({
  disabled: 'no callers found, 2026-10-20',
  scopes: ['admin:*'],
  func: async () => 'admin',
})

/** No scopes at all is still valid — the gate is opt-in. */
export const unscoped = pikkuFunc<void, string>({
  disabled: 'no callers found, 2026-10-20',
  func: async () => 'open',
})
