import { PRODUCTION_DISPOSITION } from '@pikku/core/virtual-user'

/**
 * Whether the server would refuse to run this persona, so the console does not
 * offer a button that can only fail. The same rule `startVirtualUserRun`
 * enforces: production takes the accountable disposition and nothing else.
 */
export const virtualUserRunRefused = (
  disposition: string,
  production: boolean | undefined
): boolean => Boolean(production) && disposition !== PRODUCTION_DISPOSITION
