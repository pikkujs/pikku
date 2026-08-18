import { defineScope } from '#pikku/addon/scopes'

/**
 * Scopes the console's own surface requires.
 *
 * Everything that administers the *application* rather than the console —
 * users, roles and scopes, credentials, the audit trail — lives in
 * `@pikku/addon-admin` under the `admin` tree, so an app can expose it without
 * installing a console it will never serve.
 *
 * These flow into the host's ScopeId union and declared set when the addon is
 * wired, so a host role can grant them.
 */
defineScope({
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
            description: 'Per-user credentials an agent needs connected',
            scopes: {
              read: {
                description: 'Check which credentials the caller has connected',
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
              manage: {
                description: 'Delete scenario runs and their artifacts',
              },
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
