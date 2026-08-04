import { defineSystemRole } from '#pikku/pikku-types.gen.js'

/**
 * The roles that ship with the e2e app.
 *
 * All three exist to draw the seams the console-authorization suites test one
 * assertion at a time, and they are declared here rather than composed in the
 * seed because a persona may only name a system role — a role composed at
 * runtime can be deleted from the console, and a persona pinned to one would go
 * on claiming to test something nobody grants any more.
 */
defineSystemRole({
  /**
   * The umbrella `admin` grant, and nothing else.
   *
   * Held by both `admin` and `staff`, which is what makes the scopes-console
   * suite's central case expressible: `staff` passes the console's global admin
   * gate and is still refused by the scope-admin RPCs, because `admin` is a
   * different tree from `pikku:scopes`. It was a direct scope grant before
   * personas existed; a role is the only way to say it now, and it says the
   * same thing — pikku's parent-grant rule means holding `admin` satisfies
   * `admin:impersonate`, `admin:users:list` and the rest beneath it.
   */
  'platform-admin': {
    displayName: 'Platform administrator',
    description: 'Every capability that acts on the application as a whole',
    scopes: ['admin'],
  },
  /**
   * The console's own scope administration. Deliberately disjoint from
   * `platform-admin`: holding one says nothing about the other, which is the
   * whole point of the pair.
   */
  'console-admin': {
    displayName: 'Console administrator',
    description: 'Manage roles and scopes in the console',
    scopes: ['pikku:scopes:read', 'pikku:scopes:manage'],
  },
  /**
   * Read the audit trail and nothing else.
   *
   * Separate from `console-admin` on purpose: `pikku:audit:read` is not under
   * `pikku:scopes`, so holding the console's scope administration says nothing
   * about being allowed to read who did what. Granted to `admin` alone, which
   * leaves `staff` — an admin holding no `pikku` scope — as the audit page's
   * refused case, the same seam the scopes console suite draws.
   */
  'audit-reader': {
    displayName: 'Audit reader',
    description: 'Read the audit trail',
    scopes: ['pikku:audit:read'],
  },
  /** Read reports and nothing else — the positive case for a scope gate. */
  'report-viewer': {
    displayName: 'Report viewer',
    description: 'Read reports',
    scopes: ['reports:read'],
  },
})
