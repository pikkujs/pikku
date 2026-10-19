import { defineScope } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * What may be done — on the platform, by anybody holding the scope.
 *
 * Read this alongside `membership.org_role`, because the two answer different
 * questions and a multi-tenant app needs both:
 *
 *   scope       — *what kind of action* is this, and may this person do it at all
 *   membership  — *which organisation's rows* may they do it to
 *
 * A scope cannot express tenancy. "May edit issues" is a scope; "may edit
 * **this** issue" depends on whether the caller belongs to the organisation
 * that owns it, which is a fact about a row and therefore a permission.
 *
 * Getting that split wrong is not a bug, it is a data breach: a scope check
 * alone would let any member of any organisation edit any issue in the product.
 *
 * No `admin` here — `@pikku/addon-console` declares that tree.
 */
// @snippet start defineScopes
defineScope({
  projects: {
    displayName: 'Projects',
    description: 'Workspaces within an organisation',
    scopes: {
      read: { description: 'See projects' },
      write: { description: 'Create, rename and archive projects' },
    },
  },
  issues: {
    displayName: 'Issues',
    description: 'The work items themselves',
    scopes: {
      read: { description: 'See issues' },
      create: { description: 'Raise an issue' },
      assign: { description: 'Assign an issue to somebody' },
      close: { description: 'Close or reopen an issue' },
    },
  },
  members: {
    displayName: 'Members',
    description: 'Who is in an organisation',
    scopes: {
      read: { description: 'See the member list' },
      invite: { description: 'Invite somebody to an organisation' },
      remove: { description: 'Remove somebody from an organisation' },
    },
  },
  billing: {
    displayName: 'Billing',
    description: 'Plan and seats',
    scopes: {
      read: { description: 'See the plan and seat usage' },
      manage: { description: 'Change plan or seat count' },
    },
  },
})
// @snippet end defineScopes
