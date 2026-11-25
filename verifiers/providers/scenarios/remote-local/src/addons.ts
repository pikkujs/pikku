import { wireRemoteAddon } from '#pikku/addon'

wireRemoteAddon({
  name: 'remote',
  package: '@verifier/prov-hostile',
  serverUrl: 'https://example.invalid',
  local: { package: '@verifier/prov-hostile', providers: ['pinoLogger'] },
} as never)
