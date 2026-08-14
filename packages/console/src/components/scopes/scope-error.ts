import { PikkuFetchError } from '@pikku/fetch'

/**
 * The scope RPCs are self-hosting: reading roles or the vocabulary itself
 * requires the `pikku:console:scopes:read` scope. The fetch client throws a
 * `PikkuFetchError` on a non-2xx, so a 403 here means the signed-in user simply
 * lacks that scope — a permission problem, not the service being down.
 */
export const isForbiddenScopeError = (error: unknown): boolean =>
  error instanceof PikkuFetchError && error.status === 403
