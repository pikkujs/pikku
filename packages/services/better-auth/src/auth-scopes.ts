import { hasScopes } from '@pikku/core'
import type { CoreServices } from '@pikku/core'
import type { Logger, ScopeService } from '@pikku/core/services'

/**
 * The scope ids this package's own gates check.
 *
 * Declared here so a host never has to spell them out as bare strings, and so
 * the tree an app must `wireScope` is discoverable from one place. Every one
 * hangs off the `admin` root, which means a single `admin` grant covers the
 * lot — pikku's parent-grant rule makes it the direct replacement for what
 * better-auth's `admin()` plugin expressed as `role === 'admin'`.
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
} as const

/**
 * The `admin` scope tree the framework's gates check, ready to spread into a
 * host's own `wireScope({ ... })` call.
 *
 * Scopes are declared by the app, not the framework — the CLI extracts them
 * from `wireScope` by AST, so this is documentation-as-code rather than a
 * registration hook. `@pikku/addon-console` declares the same tree, so an app
 * wiring the console inherits it and need not repeat this.
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
        },
      },
      users: {
        description: 'The user directory',
        scopes: {
          list: { description: 'List and search users' },
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
