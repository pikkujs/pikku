import type { HostResolver } from './safe-fetch.js'

let defaultHostResolver: HostResolver | undefined

export const getDefaultHostResolver = (): HostResolver | undefined =>
  defaultHostResolver

/**
 * Installs the resolver `safeFetch` uses when a call passes no `resolveHost`
 * of its own.
 *
 * Core cannot resolve DNS itself — Workers has no DNS API — so without a
 * resolver the guard is literal-only and a public name pointing at
 * `169.254.169.254` passes. Node runtimes install
 * `nodeHostResolver` from `@pikku/core/node-host-resolver` at startup.
 */
export const setDefaultHostResolver = (
  resolver: HostResolver | undefined
): void => {
  defaultHostResolver = resolver
}
