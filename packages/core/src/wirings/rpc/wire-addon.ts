import { pikkuState } from '../../pikku-state.js'

export type WireAddonConfig = {
  name: string
  package: string
  rpcEndpoint?: string
  auth?: boolean
  tags?: string[]
  secretOverrides?: Record<string, string>
  variableOverrides?: Record<string, string>
}

export const wireAddon = (config: WireAddonConfig): void => {
  pikkuState(null, 'rpc', 'addons').set(config.name, {
    package: config.package,
    rpcEndpoint: config.rpcEndpoint,
    auth: config.auth,
    tags: config.tags,
  })
}
