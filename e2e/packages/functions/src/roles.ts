import { defineSystemRole } from '#pikku/scopes'

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
   * Every administrative area except scope administration and the audit trail.
   *
   * Held by both `admin` and `staff`, which is what makes the scopes-console
   * suite's central case expressible: `staff` reaches the console and is still
   * refused by the scope-admin RPCs and the audit trail, because those two
   * areas are granted by `console-admin` and `audit-reader` alone. Both the
   * `admin` and `pikku:console` areas are spelled out leaf by leaf rather than
   * granted as their parent precisely so those two stay out — a bare `admin`
   * would cover `admin:scopes:*` and `admin:audit:read` and collapse the seam.
   */
  'platform-admin': {
    displayName: 'Platform administrator',
    description: 'Every capability that acts on the application as a whole',
    scopes: [
      'admin:impersonate',
      'admin:users:list',
      'admin:users:create',
      'admin:users:ban',
      'admin:users:remove',
      'admin:users:sessions',
      'admin:users:password',
      'admin:credentials:link',
      'pikku:console:addons:read',
      'pikku:console:addons:install',
      'admin:credentials:read',
      'admin:credentials:manage',
      'pikku:console:secrets:read',
      'pikku:console:secrets:write',
      'pikku:console:variables:read',
      'pikku:console:variables:write',
      'pikku:console:wirings:read',
      'pikku:console:security:read',
      'pikku:console:security:run',
      'pikku:console:workflows:read',
      'pikku:console:workflows:manage',
      'pikku:console:scenarios:read',
      'pikku:console:scenarios:manage',
      'pikku:console:agents:read',
      'pikku:console:agents:manage',
      'pikku:console:db:read',
      'pikku:console:knowledge:read',
      'pikku:console:emails:read',
      'pikku:console:emails:write',
      'pikku:console:code:write',
    ],
  },
  /**
   * The console's own scope administration. Deliberately disjoint from
   * `platform-admin`: holding one says nothing about the other, which is the
   * whole point of the pair.
   */
  'console-admin': {
    displayName: 'Console administrator',
    description: 'Manage roles and scopes in the console',
    scopes: ['admin:scopes:read', 'admin:scopes:manage'],
  },
  /**
   * Read the audit trail and nothing else.
   *
   * Separate from `console-admin` on purpose: `admin:audit:read` is not under
   * `admin:scopes`, so holding the console's scope administration says nothing
   * about being allowed to read who did what. Granted to `admin` alone, which
   * leaves `staff` — an admin holding no `pikku` scope — as the audit page's
   * refused case, the same seam the scopes console suite draws.
   */
  'audit-reader': {
    displayName: 'Audit reader',
    description: 'Read the audit trail',
    scopes: ['admin:audit:read'],
  },
  /** Read reports and nothing else — the positive case for a scope gate. */
  'report-viewer': {
    displayName: 'Report viewer',
    description: 'Read reports',
    scopes: ['reports:read'],
  },
})
