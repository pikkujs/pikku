import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// The root route is the earliest module every client render goes through, so an
// import prepended here runs before anything can fetch. TanStack Start serves it
// under split ids too (`__root.tsx?tsr-split=...`) — matching the path and
// ignoring the query covers every variant, and importing the shim twice is a
// no-op (ES modules are cached, and the install itself is idempotent).
export const ROOT_ROUTE = /[\\/]src[\\/]routes[\\/]__root\.tsx(?:$|\?)/

const CLIENT_MODULE = fileURLToPath(
  new URL('./cross-site-session.client.js', import.meta.url)
)

const VIRTUAL_ID = 'virtual:pikku-cross-site-session'
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`

export interface CrossSiteSessionOptions {
  /**
   * Absolute path to the module exporting `apiUrl()` — the `envFile` the Pikku
   * CLI generates. The relay only ever talks to that origin. Omit it and the
   * client falls back to `VITE_API_URL`, then the page origin plus `/api`.
   */
  envFile?: string
}

/** The source of the module the plugin injects: install the relay with the app's `apiUrl`. */
export const virtualModuleSource = (envFile?: string): string =>
  envFile
    ? [
        `import { installCrossSiteSession } from ${JSON.stringify(CLIENT_MODULE)}`,
        `import { apiUrl } from ${JSON.stringify(envFile)}`,
        'installCrossSiteSession(apiUrl)',
      ].join('\n')
    : [
        `import { installCrossSiteSession } from ${JSON.stringify(CLIENT_MODULE)}`,
        'installCrossSiteSession(() => import.meta.env.VITE_API_URL ?? window.location.origin + "/api")',
      ].join('\n')

/**
 * Dev-only: relay the Better Auth session cookie through localStorage so the app
 * stays signed in inside the Pikku Studio Cloud console's cross-site preview iframe on
 * browsers that refuse third-party cookies (WebKit — i.e. every browser on iOS).
 * See cross-site-session.client.ts for the mechanism.
 *
 * A plugin rather than an import in `src/`, because this must not exist in a
 * deployed app at all: `apply: 'serve'` keeps the module out of the production
 * graph entirely, instead of shipping it and relying on a dead-code branch.
 */
export function crossSiteSession(
  options: CrossSiteSessionOptions = {}
): Plugin {
  return {
    name: 'pikku:cross-site-session',
    apply: 'serve',
    // After the route transforms have run: this only prepends an import, which
    // is valid wherever it lands, and running last keeps it out of the way of
    // the plugins that actually parse the route.
    enforce: 'post',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : undefined
    },
    load(id) {
      return id === RESOLVED_VIRTUAL_ID
        ? virtualModuleSource(options.envFile)
        : undefined
    },
    transform(code, id, transformOptions) {
      // The server render has no fetch to patch and no storage to read.
      if (transformOptions?.ssr || !ROOT_ROUTE.test(id)) return
      return {
        code: `import ${JSON.stringify(VIRTUAL_ID)}\n${code}`,
        map: null,
      }
    },
  }
}
