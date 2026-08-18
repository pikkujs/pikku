import { defineScope } from '#pikku/addon/scopes'

/**
 * The `admin` tree: every capability that acts on the application as a whole.
 *
 * A single `admin` grant covers the lot, because pikku's parent-grant rule
 * makes the root the direct replacement for what better-auth's `admin()` plugin
 * expressed as `role === 'admin'`.
 *
 * Deliberately not declared on this addon's `wireAddon` — `verifyScopes` is a
 * conjunction over the addon's scopes and the function's, so an addon-level
 * `admin` would force the root on a caller granted only `admin:users:list` and
 * make every leaf below pointless. Each function carries its own.
 *
 * pikku requires every declaration of a shared scope root to be identical, so
 * this must stay byte-identical to `ADMIN_SCOPE_TREE` in `@pikku/better-auth`
 * and to the copy the `scaffold.userAdmin` generator emits.
 */
defineScope({
  admin: {
    displayName: 'Administration',
    description: 'Capabilities that act on the application as a whole',
    scopes: {
      impersonate: { description: 'Act as another user' },
      credentials: {
        description: 'Application-wide credentials',
        scopes: {
          link: { description: 'Bind a shared credential for every user' },
          read: { description: 'Read credential values and who holds them' },
          manage: { description: 'Set and delete credentials' },
        },
      },
      users: {
        description: 'The user directory',
        scopes: {
          list: { description: 'List and search users' },
          create: { description: 'Create users out of band' },
          ban: { description: 'Ban and unban users' },
          remove: { description: 'Delete users and all their data' },
          sessions: { description: "Revoke a user's sessions" },
          password: { description: "Set a user's password" },
        },
      },
      scopes: {
        description: 'Authorization management',
        scopes: {
          read: {
            description: 'View declared scopes, roles, and who holds them',
          },
          manage: {
            description:
              'Create and delete roles, change their scopes, and grant roles to users',
          },
        },
      },
      audit: {
        description: 'The audit trail',
        scopes: {
          read: {
            description:
              'Read the audit trail — every recorded action, and which user took it',
          },
        },
      },
    },
  },
})
