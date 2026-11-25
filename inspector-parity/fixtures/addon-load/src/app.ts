declare function wireAddon(x: any): void
declare function wireRemoteAddon(x: any): void
wireAddon({
  name: 'ext',
  package: '@acme/addon',
  mcp: true,
  mcpEndpoint: true,
  expose: ['hello', 'nope', 'bye'],
  ui: true,
  scopes: ['z', 'a'],
  uses: { mail: 'mailer' },
  secretOverrides: { apiKey: 'myKey' },
  variableOverrides: { region: 'myRegion' },
  credentialOverrides: {
    oauth: { name: 'myOauth', mode: 'wire' },
    plain: 'plainName',
  },
  providers: ['c1', 'missing'],
  tags: ['t'],
  auth: false,
  rpcEndpoint: '/rpc/ext',
  globalSecrets: 'GS',
  contentBucket: 'b',
  contentGrants: { x: 'rw' },
})
wireAddon({ name: 'two', package: '@acme/addon2', mcp: ['x'] })
wireAddon({
  name: 'three',
  package: '@acme/missing',
  mcp: ['x'],
  expose: ['q'],
})
wireRemoteAddon({
  name: 'rem',
  package: '@acme/remote@^1.2.0',
  local: { package: '@acme/addon', ui: true, providers: ['c1'] },
  auth: { credentialId: 'x' },
})
wireAddon({ name: 'stale', package: '@acme/addon3', providers: ['old'] })
