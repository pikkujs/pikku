import { pikkuState } from '../../pikku-state.js'

export type WireAddonConfig = {
  name: string
  package: string
  rpcEndpoint?: string
  auth?: boolean
  mcp?: boolean
  tags?: string[]
  secretOverrides?: Record<string, string>
  variableOverrides?: Record<string, string>
  credentialOverrides?: Record<string, string>
}

export const wireAddon = (config: WireAddonConfig): void => {
  pikkuState(null, 'addons', 'packages').set(config.name, {
    package: config.package,
    rpcEndpoint: config.rpcEndpoint,
    auth: config.auth,
    tags: config.tags,
  })
}
