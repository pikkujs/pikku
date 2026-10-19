import { pikkuState } from '../../pikku-state.js'
import type { CoreServices, PikkuWire } from '../../types/core.types.js'
import { parseRemoteAddonPackage } from './remote-addon-package.js'

/** Sent as `Authorization: Bearer <token>`; a non-default header is declared by the addon. */
export type RemoteAddonAuth =
  | { credentialId: string }
  | { secretId: string }
  | {
      /** `null` sends this call without a credential, for a public surface. */
      resolve: (
        services: CoreServices,
        wire: PikkuWire
      ) => string | null | Promise<string | null>
    }

/**
 * Sent on every call to a hosted addon. The host's `rpc.exposed` then answers
 * only functions in the addon's remote contract (`remote: true`), so a consumer
 * holding a token cannot reach the host's other exposed functions through it.
 * It can only narrow what the host answers, never widen it.
 *
 * knowledge: decisions/security/wire-addon-expose-selects-the-rpc-surface.md
 */
export const REMOTE_CONTRACT_HEADER = 'x-pikku-remote-contract'

/** How long a call to a hosted addon may take when `timeoutMs` is not set. */
export const DEFAULT_REMOTE_ADDON_TIMEOUT_MS = 30_000

/** Options for `wireRemoteAddon`: the namespace, the contract package, where the addon is deployed and how calls authenticate. */
export type WireRemoteAddonConfig = {
  /** Consumer-facing namespace, e.g. `registry` → `rpc('registry:getOpenApi')` */
  name: string
  /**
   * The contract package, as a string literal. `@scope/name@^1.4.0` pins a
   * range: `pikku all` downloads the addon's SDK from the registry and
   * records it in `pikku-addons.lock`. A bare `@scope/name` must be installed
   * as a devDependency instead — `pikku verify` enforces both.
   */
  package: string
  /** Where the addon is deployed, e.g. `https://registry.example.com`. A function when it varies per environment. */
  serverUrl: string | ((services: CoreServices) => string | Promise<string>)
  /** Omit when the addon declares its remote surface public. */
  auth?: RemoteAddonAuth
  /** Map a consumer-facing fn name → the remote fn name, when they differ (rare). */
  remoteName?: (fn: string) => string
  /** Applied to every function the addon contributes, so tag middleware and permissions reach them. */
  tags?: string[]
  /**
   * Which of the addon's contract functions this app's `rpc.exposed` — and so
   * its public `POST /rpc/:rpcName` — forwards to the host, under
   * `<name>:<function>`. `true` forwards every contract function, a list only
   * those named, and unset or `false` none: server-side `rpc('<name>:fn')`
   * calls are unaffected.
   *
   * knowledge: decisions/security/wire-addon-expose-selects-the-rpc-surface.md
   */
  expose?: boolean | string[]
  /** Milliseconds a call may take before it is aborted. Defaults to {@link DEFAULT_REMOTE_ADDON_TIMEOUT_MS}. */
  timeoutMs?: number
  /** Extra headers for every call to the host. Cannot replace the auth, trace or contract headers. */
  headers?: (
    services: CoreServices,
    wire: PikkuWire
  ) => Record<string, string> | Promise<Record<string, string>>
}

/**
 * Installs an addon that runs as its own deployed service: the contract is
 * local, the calls go over the wire to the addon's own host.
 */
export const wireRemoteAddon = (config: WireRemoteAddonConfig): void => {
  pikkuState(null, 'addons', 'packages').set(config.name, {
    package: parseRemoteAddonPackage(config.package).name,
    tags: config.tags,
    remote: true,
    serverUrl: config.serverUrl,
    ...(config.expose !== undefined ? { expose: config.expose } : {}),
    ...(config.auth ? { remoteAuth: config.auth } : {}),
    ...(config.remoteName ? { remoteName: config.remoteName } : {}),
    ...(config.timeoutMs !== undefined
      ? { remoteTimeoutMs: config.timeoutMs }
      : {}),
    ...(config.headers ? { remoteHeaders: config.headers } : {}),
  })
}
