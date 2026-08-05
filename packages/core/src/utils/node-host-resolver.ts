import { lookup } from 'node:dns/promises'

import { setDefaultHostResolver, type HostResolver } from './safe-fetch.js'

/**
 * Resolves a hostname through the platform resolver, returning every address it
 * points at so `safeFetch` can reject a public name aimed at an internal one.
 *
 * This module is Node-only and is never imported by core itself — Workers has no
 * DNS API, and a static `node:dns` import in the shared path would break that
 * build.
 */
export const nodeHostResolver: HostResolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true })
  return results.map(({ address }) => address)
}

/** Installs {@link nodeHostResolver} as the default for every `safeFetch`. */
export const installNodeHostResolver = () =>
  setDefaultHostResolver(nodeHostResolver)
