import { defineSystemRole } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * Who may do it — **on the platform**.
 *
 * This is the part that trips people up in a multi-tenant product. A declared
 * system role is global: one account holds one set of them, everywhere. But the
 * same person is the owner of their own workspace and a plain member of a
 * client's, and no global role can say that.
 *
 * So the two live side by side, and each answers only what it can:
 *
 *   defineSystemRole  — what this account may do anywhere (the *verbs*)
 *   membership.orgRole — what they may do inside one organisation (the *rows*)
 *
 * `customer` deliberately holds every verb a normal user ever needs. That looks
 * alarming until you notice the second half: holding `issues:close` lets you
 * close issues *in organisations you belong to*, and the tenancy permission is
 * what makes that true. Withholding the verb globally would instead mean nobody
 * could ever close anything, because there is no per-tenant scope grant.
 */
// @snippet start defineRoles
defineSystemRole({
  /**
   * Everybody who uses the product. The org-level role narrows this further —
   * a `viewer` membership passes the scope check and fails the permission.
   */
  customer: {
    displayName: 'Customer',
    description: 'A normal user, acting inside the organisations they belong to',
    scopes: ['projects', 'issues', 'members:read', 'billing:read'],
  },
  /**
   * Your own staff, helping a customer. Holds `admin:impersonate` from the
   * console addon rather than a bespoke "support mode" flag — impersonation is
   * a platform capability with an audit trail, not an if-statement.
   *
   * Note what it does NOT hold: no `issues:close`, no `billing:manage`. Support
   * can see a customer's workspace to diagnose it and cannot act inside it,
   * which is the difference between helping and editing somebody's data.
   */
  support: {
    displayName: 'Support',
    description: 'Read a customer’s workspace to diagnose a problem',
    scopes: ['projects:read', 'issues:read', 'members:read', 'billing:read', 'admin:impersonate'],
  },
  admin: {
    displayName: 'Administrator',
    description: 'Everything, plus console administration',
    scopes: ['projects', 'issues', 'members', 'billing', 'pikku:console', 'virtualUser'],
  },
})
// @snippet end defineRoles
