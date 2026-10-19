import { fileURLToPath, URL } from 'node:url'
import type { Plugin } from 'vite'

// The root route is the earliest module every client render goes through, so an
// import prepended here runs before anything can fetch. TanStack Start serves it
// under split ids too (`__root.tsx?tsr-split=...`) — matching the path and
// ignoring the query covers every variant, and importing the shim twice is a
// no-op (ES modules are cached, and the install itself is idempotent).
const ROOT_ROUTE = /[\\/]src[\\/]routes[\\/]__root\.tsx(?:$|\?)/

const CLIENT_MODULE = fileURLToPath(
  new URL('./cross-site-session.client.ts', import.meta.url),
)

/**
 * Dev-only: relay the Better Auth session cookie through localStorage so the app
 * stays signed in inside the Fabric console's cross-site preview iframe on
 * browsers that refuse third-party cookies (WebKit — i.e. every browser on iOS).
 * See cross-site-session.client.ts for the mechanism.
 *
 * A plugin rather than an import in `src/`, because this must not exist in a
 * deployed app at all: `apply: 'serve'` keeps the module out of the production
 * graph entirely, instead of shipping it and relying on a dead-code branch.
 */
export function crossSiteSession(): Plugin {
  return {
    name: 'pikku:cross-site-session',
    apply: 'serve',
    // After the route transforms have run: this only prepends an import, which
    // is valid wherever it lands, and running last keeps it out of the way of
    // the plugins that actually parse the route.
    enforce: 'post',
    transform(code, id, options) {
      // The server render has no fetch to patch and no storage to read.
      if (options?.ssr || !ROOT_ROUTE.test(id)) return
      return {
        code: `import ${JSON.stringify(CLIENT_MODULE)}\n${code}`,
        map: null,
      }
    },
  }
}
