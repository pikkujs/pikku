import { pikkuFunc } from '#pikku/pikku-types.gen.js'

/**
 * A scope-gated function used by the e2e scope suite: the session must hold
 * `reports:read`, so an authenticated-but-unscoped caller gets a 403 and a
 * scoped caller gets a 200. Exposed as an RPC so the gate can be exercised over
 * HTTP without a bespoke route.
 */
export const getReport = pikkuFunc<void, { report: string }>({
  expose: true,
  scopes: ['reports:read'],
  func: async () => ({ report: 'quarterly numbers' }),
})
