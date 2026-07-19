import { pikkuState } from '../../pikku-state.js'
import type { CoreServices, PikkuWire } from '../../types/core.types.js'

/**
 * How the consumer supplies the token the hosted addon's auth expects.
 *
 * This is a CLIENT authenticating to a hosted library — NOT pikku's trusted
 * machine-to-machine mesh (which uses `PIKKU_REMOTE_SECRET`). The consumer binds
 * the addon's declared auth requirement to a local source:
 *  - `credentialId` — per-user credential, resolved via `wire.getCredential(id)`
 *  - `secretId`     — platform key, resolved via the secrets service
 *  - `resolve`      — custom escape hatch
 * Omit entirely when the addon declares its remote surface is public.
 *
 * The value is sent `Authorization: Bearer <token>` by default; a non-default
 * header is declared once by the addon (its meta), never chosen here.
 */
export type RemoteAddonAuth =
  | { credentialId: string }
  | { secretId: string }
  | { resolve: (services: CoreServices, wire: PikkuWire) => string | Promise<string> }

export type WireRemoteAddonConfig = {
  /** Consumer-facing namespace, e.g. `registry` → `rpc('registry:getOpenApi')` */
  name: string
  /**
   * The addon package. Installed as a **devDependency** (types only — its
   * handlers run on the host); `pikku verify` enforces this.
   */
  package: string
  /** Base URL of the host serving the addon's remote surface. */
  serverUrl: string | ((services: CoreServices) => string | Promise<string>)
  /** Bind the addon's declared auth to a local source. Omit if the surface is public. */
  auth?: RemoteAddonAuth
  /** Map a consumer-facing fn name → the remote fn name, when they differ (rare). */
  remoteName?: (fn: string) => string
  tags?: string[]
}

/**
 * Consume a hosted addon's `remote: true` RPCs transparently over HTTP.
 *
 * Unlike `wireAddon` (which bundles the addon's functions in-process, a
 * production dependency), `wireRemoteAddon` dispatches `rpc('name:fn')` to the
 * host at `serverUrl`, fully typed — the addon ships as a devDependency (types
 * only). See {@link RemoteAddonAuth} for how auth is bound.
 */
export const wireRemoteAddon = (config: WireRemoteAddonConfig): void => {
  pikkuState(null, 'addons', 'packages').set(config.name, {
    package: config.package,
    tags: config.tags,
    remote: true,
    serverUrl: config.serverUrl,
    ...(config.auth ? { remoteAuth: config.auth } : {}),
    ...(config.remoteName ? { remoteName: config.remoteName } : {}),
  })
}
