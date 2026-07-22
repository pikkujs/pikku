import { wireScope } from '#pikku'

/**
 * Scopes the console's own authorization management requires, plus the `admin`
 * tree the framework's own gates check.
 *
 * Self-hosting: the functions that grant scopes are themselves scoped, so
 * handing someone the console does not hand them the ability to grant
 * themselves anything. These flow into the host's ScopeId union and declared
 * set when the addon is wired, so a host role can grant them.
 *
 * The `admin` tree mirrors `ADMIN_SCOPE_TREE` in `@pikku/better-auth` — it is
 * spelled out inline because `wireScope` is extracted by AST, so an imported
 * constant cannot be spread here. Keep the two in sync: pikku requires every
 * declaration of a shared scope root to be byte-identical, so this must match
 * the `scaffold.userAdmin` output too, including the leaves whose capabilities
 * only exist once better-auth's admin() plugin is wired.
 */
wireScope({
  admin: {
    displayName: 'Administration',
    description: 'Capabilities that act on the application as a whole',
    scopes: {
      impersonate: { description: 'Act as another user' },
      credentials: {
        description: 'Application-wide credentials',
        scopes: {
          link: { description: 'Bind a shared credential for every user' },
        },
      },
      users: {
        description: 'The user directory',
        scopes: {
          list: { description: 'List and search users' },
          ban: { description: 'Ban and unban users' },
          remove: { description: 'Delete users and all their data' },
          sessions: { description: "Revoke a user's sessions" },
          password: { description: "Set a user's password" },
        },
      },
    },
  },
  pikku: {
    displayName: 'Pikku Console',
    description: "The console's own administrative capabilities",
    scopes: {
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
    },
  },
})
