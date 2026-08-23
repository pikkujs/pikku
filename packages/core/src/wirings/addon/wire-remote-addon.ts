import { pikkuState } from '../../pikku-state.js'
import type { CoreServices, PikkuWire } from '../../types/core.types.js'

/** Sent as `Authorization: Bearer <token>`; a non-default header is declared by the addon. */
export type RemoteAddonAuth =
  | { credentialId: string }
  | { secretId: string }
  | {
      resolve: (
        services: CoreServices,
        wire: PikkuWire
      ) => string | Promise<string>
    }

export type WireRemoteAddonConfig = {
  /** Consumer-facing namespace, e.g. `registry` → `rpc('registry:getOpenApi')` */
  name: string
  /** Must be installed as a devDependency — `pikku verify` enforces this. */
  package: string
  serverUrl: string | ((services: CoreServices) => string | Promise<string>)
  /** Omit when the addon declares its remote surface public. */
  auth?: RemoteAddonAuth
  /** Map a consumer-facing fn name → the remote fn name, when they differ (rare). */
  remoteName?: (fn: string) => string
  tags?: string[]
}

/**
 * Installs an addon that runs as its own deployed service: the contract is
 * local, the calls go over the wire to the addon's own host.
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
