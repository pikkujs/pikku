import { wireAddon, wireRemoteAddon } from '#pikku/addon'

wireAddon({ name: 'studio', package: '@verifier/svc-select' })

wireRemoteAddon({
  name: 'cloud',
  package: '@verifier/svc-bad',
  serverUrl: 'https://cloud.example.com',
  local: {
    package: '@verifier/svc-notify',
    providers: ['notifier', 'loggerPrefix'],
  },
})
