import { wireRemoteAddon } from '#pikku/addon'

wireRemoteAddon({
  name: 'remote',
  url: 'https://example.invalid',
  local: { package: '@verifier/prov-hostile', providers: ['pinoLogger'] },
} as never)
