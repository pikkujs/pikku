import { wireRemoteAddon } from '#pikku/addon'

wireRemoteAddon({
  name: 'remote',
  url: 'https://example.invalid',
  providers: ['pinoLogger'],
} as never)
