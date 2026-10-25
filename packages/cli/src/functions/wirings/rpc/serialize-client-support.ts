/**
 * The small files a frontend needs beside the generated clients: the record
 * types, the API base URL, an RPC client for code outside React, and the Better
 * Auth glue. Each is derived from the project's config, so none of the paths in
 * them are written by hand.
 */

const ANALYTICS_EVENT_COMMENT = `// The analytics registry, re-exported for the frontend: type-only, so nothing
// backend ends up in the browser bundle. This is what makes \`analytics.event()\`
// typed at the call site — the event name and its payload come from the one zod
// union the generated ingest validates against.`

/**
 * Record types for the frontend, resolved from the generated RPC map — the same
 * source `usePikkuQuery`/`usePikkuMutation` resolve their data types from.
 *
 * @param rpcMapPath - import path to the file declaring `FlattenedRPCMap`
 * @param analyticsPath - import path to the analytics scaffold, only when it is on
 */
export const serializeTypes = (
  rpcMapPath: string,
  analyticsPath?: string
): string => {
  return `// Record types for the FRONTEND, resolved from the generated RPC map.
//
//   import type { RPCOutput } from '<this folder>/types.gen'
//   type Resource = RPCOutput<'listResources'>['resources'][number]
//
// The field types flow from the backend function's \`output:\` schema, and a
// schema change breaks the component at compile time instead of at runtime.
import type { FlattenedRPCMap } from '${rpcMapPath}'

export type { FlattenedRPCMap }

/** The input type of an RPC — the shape a form must produce. */
export type RPCInput<Name extends keyof FlattenedRPCMap> = FlattenedRPCMap[Name]['input']

/** The output type of an RPC — index into it for a row type. */
export type RPCOutput<Name extends keyof FlattenedRPCMap> = FlattenedRPCMap[Name]['output']
${
  analyticsPath
    ? `
${ANALYTICS_EVENT_COMMENT}
export type { AnalyticsEvent } from '${analyticsPath}'
`
    : ''
}`
}

/**
 * The API base URL and the path the app is mounted under.
 *
 * In local dev VITE_API_URL is set at build time and Vite replaces the
 * import.meta.env reference inline. In deployments where it is a runtime binding
 * — invisible to Vite at build time — the bundle sees it undefined, so the
 * fallback is the current origin plus `/api`, which is correct because the
 * dispatcher routes every `/api/*` path to the API on the same hostname.
 */
export const serializeEnv = (): string => {
  return `export function apiUrl(): string {
  if (import.meta.env.SSR) {
    // SSR context: the provider's serverUrl is only consumed by hooks that run in
    // the browser. Return the build-time var when available (local dev) or a
    // placeholder so SSR never throws.
    return import.meta.env.VITE_API_URL ?? '/__api'
  }
  // Client: use the build-time var (local dev) or derive from current origin.
  // Guard: a localhost API base served from a real (remote) origin is a stray
  // dev-server leak — the browser can never reach it, so ignore it and use
  // same-origin /api, which is always correct for a deployed bundle.
  const configured = import.meta.env.VITE_API_URL
  const remote = !/^(localhost|127\\.0\\.0\\.1)$/.test(window.location.hostname)
  if (configured && !(remote && /\\/\\/(localhost|127\\.0\\.0\\.1)(:|\\/)/.test(configured))) {
    return configured
  }
  return window.location.origin + '/api'
}

/**
 * The path this frontend is mounted under. A non-primary app is served at
 * \`/_frontend/<slug>/\` on a single origin, which the host hands to vite as
 * the base — so BASE_URL is the only truth about the prefix.
 */
export function basePath(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base.slice(0, -1) : base
}

/**
 * Absolute in-app href for anything the router does not resolve itself — a raw
 * \`window.location\` assignment or a URL handed to Better Auth to redirect back to.
 */
export function appHref(path: string): string {
  return \`\${basePath()}\${path}\`
}
`
}

/**
 * A PikkuRPC client for code that runs OUTSIDE React — route `beforeLoad` gates,
 * mostly. TanStack Start only.
 *
 * @param rpcWiringsPath - import path to the file exporting the `PikkuRPC` class
 * @param envPath - import path to the generated env file
 */
export const serializeRpc = (
  rpcWiringsPath: string,
  envPath: string
): string => {
  return `import { PikkuRPC } from '${rpcWiringsPath}'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestHeader, getRequestUrl } from '@tanstack/react-start/server'
import { apiUrl } from '${envPath}'

/**
 * A PikkuRPC client for code that runs OUTSIDE React — route \`beforeLoad\` gates,
 * mostly. Components use the usePikku* hooks and the provider instead.
 *
 * \`beforeLoad\` runs on BOTH sides, so this has two implementations and
 * \`createIsomorphicFn\` keeps each out of the other's bundle. The browser reuses
 * one client. The server builds a fresh one per request and forwards that
 * request's own cookie header — a module-scope singleton there would serve one
 * visitor's session to the next. Deployed, the API answers on the same hostname
 * under \`/api\`, so the request URL is the base; local dev has VITE_API_URL at
 * build time and points straight at it.
 */
let client: PikkuRPC | null = null

const resolveRpc = createIsomorphicFn()
  .client((): PikkuRPC => {
    if (!client) {
      client = new PikkuRPC()
      client.setServerUrl(apiUrl())
    }
    return client
  })
  .server((): PikkuRPC => {
    const perRequest = new PikkuRPC()
    perRequest.setServerUrl(
      import.meta.env.VITE_API_URL ?? new URL('/api', getRequestUrl()).toString(),
    )
    const cookie = getRequestHeader('cookie')
    if (cookie) perRequest.pikkuFetch.setHeader('cookie', cookie)
    return perRequest
  })

export function rpc(): PikkuRPC {
  return resolveRpc()
}
`
}

/** Where the generated auth glue sends people, from the project's `clientAuth` config. */
export interface ClientAuthPaths {
  loginPath?: string
  homePath?: string
  resetPasswordPath?: string
}

/**
 * The Better Auth client glue: account flows, cookie refresh and route gates,
 * wired to this app's own `apiUrl`, RPC client and router. TanStack Router only.
 *
 * @param rpcPath - import path to the generated `rpc()` client
 * @param envPath - import path to the generated env file
 * @param sessionRpc - the RPC that returns the signed-in session
 */
export const serializeAuthClient = (
  rpcPath: string,
  envPath: string,
  sessionRpc: string,
  paths: ClientAuthPaths = {}
): string => {
  const options = [
    `  apiUrl,`,
    `  fetchSession,`,
    `  redirect,`,
    ...(paths.loginPath
      ? [`  loginPath: ${JSON.stringify(paths.loginPath)},`]
      : []),
    ...(paths.homePath
      ? [`  homePath: ${JSON.stringify(paths.homePath)},`]
      : []),
    ...(paths.resetPasswordPath
      ? [`  resetPasswordPath: ${JSON.stringify(paths.resetPasswordPath)},`]
      : []),
  ].join('\n')
  return `import { redirect } from '@tanstack/react-router'
import { createBetterAuthApp } from '@pikku/better-auth/client'
import { rpc } from '${rpcPath}'
import { apiUrl } from '${envPath}'

export {
  INVALID_CREDENTIALS,
  EMAIL_IN_USE,
  RESET_TOKEN_INVALID,
  isUnauthorized,
} from '@pikku/better-auth/client'
export type { AuthSession } from '@pikku/better-auth/client'

export const fetchSession = () => rpc().invoke(${JSON.stringify(sessionRpc)}, {})

export type GetSessionOutput = Awaited<ReturnType<typeof fetchSession>>

export const {
  homePath,
  getAuthSession,
  signInWithPassword,
  registerWithPassword,
  signInWithGoogle,
  requestPasswordReset,
  resetPassword,
  changePassword,
  signOut,
  refreshSessionCookie,
  startSessionRefresh,
  stopSessionRefresh,
  requireAuthentication,
  redirectIfAuthenticated,
} = createBetterAuthApp({
${options}
})
`
}
