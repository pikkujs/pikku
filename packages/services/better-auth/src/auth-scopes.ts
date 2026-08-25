import { hasScopes } from '@pikku/core/scope'
import type { Logger } from '@pikku/core/services'
import type { ScopeService } from '@pikku/core/services'
import type { CoreServices } from '@pikku/core/types'

/**
 * The scope ids this package's own gates check.
 *
 * Declared here so a host never has to spell them out as bare strings, and so
 * the tree an app must `defineScope` is discoverable from one place. Every one
 * hangs off the `admin` root, which means a single `admin` grant covers the
 * lot — pikku's parent-grant rule makes it the direct replacement for what
 * better-auth's `admin()` plugin expressed as `role === 'admin'`, without a
 * column that has to be kept in step with the grants it is checked against.
 */
/** The umbrella grant: holding it satisfies every scope beneath it. */
export const ADMIN_SCOPE_ROOT = 'admin'

export const ADMIN_SCOPES = {
  /** Act as another user via the impersonation header. */
  impersonate: 'admin:impersonate',
  /** Bind a `type: 'singleton'` credential on behalf of every user. */
  credentialsLink: 'admin:credentials:link',
  /** Read the user directory. */
  usersList: 'admin:users:list',
  /** Create a user out of band, bypassing the sign-up flow. */
  usersCreate: 'admin:users:create',
  /** Ban and unban users. */
  usersBan: 'admin:users:ban',
  /** Delete a user along with their sessions and accounts. */
  usersRemove: 'admin:users:remove',
  /** Revoke a user's sessions, signing them out everywhere. */
  usersSessions: 'admin:users:sessions',
  /** Set a user's password out of band. */
  usersPassword: 'admin:users:password',
} as const

/**
 * The scope roots a Fabric operator is granted on the stage it signs into.
 *
 * `admin` covers this package's own gates, but not a tree an app declares
 * beside it: pikku's parent-grant rule only walks *down* from a root that is
 * held. The virtual-user scaffold declares `virtualUser` as its own root
 * precisely so a role can carry `virtualUser:run` without also implying
 * administration — which leaves the operator Fabric signs in to start a run
 * refused by the one function the operator sign-in exists to reach.
 *
 * Listed rather than collapsed to `*`, which would make every operator a
 * superuser on every app for the sake of one function. A root the app does not
 * declare is skipped rather than stored, so an app with no virtual users is
 * never left holding a grant nothing can explain.
 */
export const OPERATOR_SCOPE_ROOTS = [ADMIN_SCOPE_ROOT, 'virtualUser'] as const

/**
 * The `admin` scope tree the framework's gates check, ready to spread into a
 * host's own `defineScope({ ... })` call.
 *
 * Scopes are declared by the app, not the framework — the CLI extracts them
 * from `defineScope` by AST, so this is documentation-as-code rather than a
 * registration hook. `@pikku/addon-admin` declares the same tree, so an app
 * wiring that addon inherits it and need not repeat this.
 */
export const ADMIN_SCOPE_TREE = {
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
}

/**
 * Whether `userId` holds every one of `required`, resolved through a
 * {@link ScopeService}.
 *
 * Resolves the caller's grants rather than reading `session.scopes`, because
 * the framework's own gates run *before* the pikku session is mapped — at
 * impersonation or credential-link time there is only better-auth's
 * `{ user, session }`.
 *
 * Fails closed. Without a `ScopeService` nothing can be granted, so nothing is
 * authorized; that denial is logged at `warn` because an app wiring an admin
 * capability with no ScopeService has a configuration bug, not a permissions
 * problem.
 */
export const resolvedUserHoldsScopes = async (
  userId: string | undefined,
  required: readonly string[],
  scopeService: ScopeService | undefined,
  logger?: Logger
): Promise<boolean> => {
  if (!scopeService) {
    logger?.warn(
      `better-auth: denying '${required.join("', '")}' — no ScopeService is registered, so no user can hold it`
    )
    return false
  }

  if (!userId) {
    return false
  }

  return hasScopes(required, await scopeService.resolveScopes(userId))
}

/**
 * {@link resolvedUserHoldsScopes} against the `ScopeService` registered on the
 * pikku singleton services.
 */
export const userHoldsScopes = async (
  userId: string | undefined,
  required: readonly string[],
  services: CoreServices
): Promise<boolean> =>
  resolvedUserHoldsScopes(
    userId,
    required,
    (services as any).scopeService as ScopeService | undefined,
    services.logger
  )
