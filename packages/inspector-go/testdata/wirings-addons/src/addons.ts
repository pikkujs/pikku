import { wireAddon, wireRemoteAddon } from '@pikku/core/addon'

wireAddon({
  name: 'shop',
  package: '@fixture/shop-addon',
  ui: true,
  mcp: ['charge', 'listCharges', 'nope'],
  mcpEndpoint: true,
  expose: ['charge', 'ghost'],
  auth: true,
  tags: ['addon'],
  scopes: ['zeta', 'admin'],
  uses: { kysely: 'db' },
  secretOverrides: { STRIPE_KEY: 'SHOP_STRIPE_KEY' },
  variableOverrides: { CURRENCY: 'SHOP_CURRENCY' },
  credentialOverrides: {
    stripeOAuth: { name: 'shopStripe', mode: 'wire' },
    apiToken: 'shopToken',
  },
  secretGrants: ['A'],
  credentialGrants: ['B'],
  globalSecrets: true as any,
  contentBucket: 'shop-content',
  contentGrants: { images: 'read' },
})

wireAddon({
  name: 'bare',
  package: '@fixture/bare-addon',
  ui: true,
  mcp: true,
  mcpEndpoint: '/mcp/bare-tools',
})
wireAddon({ name: 'unbuilt', package: '@fixture/unbuilt' })
wireAddon({
  name: 'missing',
  package: '@fixture/not-installed',
  expose: someList,
})
declare const someList: string[]

wireRemoteAddon({
  name: 'registry',
  package: '@fixture/registry',
  serverUrl: 'https://r',
  auth: { credentialId: 'registryToken' },
})
wireRemoteAddon({
  name: 'public',
  package: '@fixture/public',
  serverUrl: 'https://p',
})
wireRemoteAddon({
  name: 'custom',
  package: '@fixture/custom',
  serverUrl: 'https://c',
  auth: { resolve: () => 'x' },
})
// Versioned: the SDK under .pikku/remote matches pikku-addons.lock.
wireRemoteAddon({
  name: 'cloudapi',
  package: '@fixture/cloud-api@^1.4.0',
  serverUrl: 'https://cloud',
})
// Versioned, never synced: PKU338.
wireRemoteAddon({
  name: 'unsynced',
  package: '@fixture/unsynced@^2.0.0',
  serverUrl: 'https://unsynced',
})
