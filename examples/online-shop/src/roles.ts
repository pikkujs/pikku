import { defineSystemRole } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * Who may do it.
 *
 * These are *system* roles: they ship with the shop, and the console may grant
 * them but cannot rename, re-scope or delete them. Roles an operator composes
 * in the console are a different thing and are not declared here — which is
 * also why a persona may only name a system role. A composed role can be
 * deleted, and a persona pinned to one would go on claiming to test something
 * nobody grants any more.
 *
 * Removing a role from this file does not revoke it. The row stays, marked
 * undeclared and inert, until `pikku roles prune` — a deploy should not be able
 * to strip access from live customers the moment it rolls out.
 */
// @snippet start defineRoles
defineSystemRole({
  customer: {
    displayName: 'Customer',
    description: 'Browse the catalogue, place and track their own orders',
    scopes: [
      'catalogue:read',
      'orders:create',
      'orders:read',
      'payments:charge',
    ],
  },
  /**
   * Handles orders but cannot change what is for sale. `orders:refund` without
   * `catalogue:write` is the seam worth having in a template: support staff
   * routinely need to undo a payment and routinely should not be able to
   * reprice the shop.
   */
  support: {
    displayName: 'Support',
    description: 'Handle customer orders, including refunds',
    scopes: [
      'catalogue:read',
      'orders:read',
      'orders:cancel',
      'orders:refund',
      'payments:manage',
    ],
  },
  /**
   * Names the parents rather than enumerating their children — pikku's
   * parent-grant rule means holding a node grants everything beneath it, so
   * `catalogue` is `catalogue:read` and `catalogue:write` in one word instead
   * of a list that drifts as the tree grows.
   *
   * `pikku:console` comes from `@pikku/addon-console`, not from this app, and
   * `virtualUser` from the virtual-user scaffold, whose RPCs no role could
   * otherwise reach. Both are parents rather than `virtualUser:*`: a wildcard
   * has no row in pikku_scopes for pikku_role_scopes to reference.
   */
  admin: {
    displayName: 'Administrator',
    description: 'Everything the shop can do, plus console administration',
    scopes: [
      'catalogue',
      'orders',
      'payments',
      'reports',
      'pikku:console',
      'virtualUser',
    ],
  },
})
// @snippet end defineRoles
