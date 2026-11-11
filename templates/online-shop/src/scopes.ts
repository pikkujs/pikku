import { defineScope } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * What may be done in the shop.
 *
 * Every node is grantable, so nesting is where the boundary goes: granting
 * `catalogue` grants `catalogue:read` and `catalogue:write` with it. That is
 * why `read` and `write` are siblings under `catalogue` rather than two
 * top-level scopes — a role that should manage the catalogue outright says
 * `catalogue`, and one that should only browse says `catalogue:read`.
 *
 * The declaration is a no-op the CLI reads by AST. It generates a `ScopeId`
 * union, so a function gating on a scope nobody declared is a compile error
 * rather than a gate that silently never matches.
 */
// @snippet start defineScopes
defineScope({
  catalogue: {
    displayName: 'Catalogue',
    description: 'Browse and manage what is for sale',
    scopes: {
      read: { description: 'Browse items and categories' },
      write: { description: 'Create, edit and withdraw items' },
    },
  },
  orders: {
    displayName: 'Orders',
    description: 'Placing and handling orders',
    scopes: {
      read: { description: 'Read orders' },
      create: { description: 'Place an order' },
      cancel: { description: 'Cancel an order before it ships' },
      refund: { description: 'Refund a paid order' },
    },
  },
  payments: {
    displayName: 'Payments',
    description: 'Reaching the payment provider',
    scopes: {
      charge: { description: 'Create a payment intent for your own order' },
      manage: {
        description: 'Refunds, customers and everything else Stripe offers',
      },
    },
  },
  reports: {
    displayName: 'Reports',
    description: 'Sales and stock reporting',
    scopes: {
      read: { description: 'Read sales and stock reports' },
    },
  },
})
// @snippet end defineScopes

/**
 * There is deliberately no console scope here.
 *
 * `@pikku/addon-console` already declares the whole `pikku:console` tree, and
 * scopes sharing a name must declare the same tree, so a second declaration is
 * a build error rather than a silent merge. The shop only declares what is
 * genuinely its own.
 *
 * This is the normal case, not a special one: an app composes its scopes with
 * whatever its addons bring.
 */
