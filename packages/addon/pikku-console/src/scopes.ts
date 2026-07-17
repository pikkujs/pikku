import { wireScope } from '#pikku'

/**
 * Scopes the console's own authorization management requires.
 *
 * Self-hosting: the functions that grant scopes are themselves scoped, so
 * handing someone the console does not hand them the ability to grant
 * themselves anything. These flow into the host's ScopeId union and declared
 * set when the addon is wired, so a host role can grant them.
 */
wireScope({
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
