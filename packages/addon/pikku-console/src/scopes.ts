import { defineScope } from '#pikku'

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
 * spelled out inline because `defineScope` is extracted by AST, so an imported
 * constant cannot be spread here. Keep the two in sync: pikku requires every
 * declaration of a shared scope root to be byte-identical, so this must match
 * the `scaffold.userAdmin` output too, including the leaves whose capabilities
 * only exist once better-auth's admin() plugin is wired.
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
    },
  },
  pikku: {
    displayName: 'Pikku Console',
    description: "The console's own administrative capabilities",
    scopes: {
      console: {
        displayName: 'Console',
        description: 'Everything reachable through the console, by area',
        scopes: {
          secrets: {
            description: "The application's secrets",
            scopes: {
              read: {
                description: 'Read secret values and check whether one is set',
              },
              write: { description: 'Set and overwrite secret values' },
            },
          },
          variables: {
            description: "The application's variables",
            scopes: {
              read: { description: 'Read variable values' },
              write: { description: 'Set and overwrite variable values' },
            },
          },
          addons: {
            description: 'Installed and available addons',
            scopes: {
              read: {
                description:
                  'Browse the addon catalogue and what this application has installed',
              },
              install: {
                description:
                  'Install an addon and write its wiring file — it runs code from the registry',
              },
            },
          },
          credentials: {
            description: 'Per-user and shared credentials',
            scopes: {
              read: {
                description: 'Read credential values and who holds them',
              },
              manage: { description: 'Set and delete credentials' },
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
          wirings: {
            description: 'Wiring metadata and function source',
            scopes: {
              read: {
                description:
                  'Read routes, channels, schemas, webhook deliveries and function source',
              },
            },
          },
          security: {
            description: 'The security audit',
            scopes: {
              read: { description: 'Read the last security audit' },
              run: { description: 'Run the security audit' },
            },
          },
          workflows: {
            description: 'Workflow runs',
            scopes: {
              read: { description: 'Read workflow runs and their steps' },
              manage: { description: 'Delete workflow runs' },
            },
          },
          scenarios: {
            description: 'Scenario runs and what they recorded',
            scopes: {
              read: {
                description:
                  'Read past scenario runs, their steps, and their screenshots and video',
              },
              manage: { description: 'Delete scenario runs and their artifacts' },
            },
          },
          agents: {
            description: 'AI agents and their threads',
            scopes: {
              read: { description: 'Read agent threads, runs, and source' },
              manage: {
                description: 'Delete threads and change agent configuration',
              },
            },
          },
          db: {
            description: 'The database schema',
            scopes: {
              read: { description: 'Read the schema the application runs on' },
            },
          },
          knowledge: {
            description: 'The knowledge notes',
            scopes: {
              read: { description: 'Read the knowledge notes' },
            },
          },
          emails: {
            description: 'Email templates',
            scopes: {
              read: { description: 'Render a template preview' },
              write: { description: 'Edit email templates' },
            },
          },
          code: {
            description: 'Editing the application source',
            scopes: {
              write: {
                description:
                  'Rewrite function bodies and configuration, and change dependencies',
              },
            },
          },
        },
      },
    },
  },
})
