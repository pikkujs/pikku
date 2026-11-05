import { wireAddon, wireRemoteAddon } from '#pikku/addon'

wireAddon({ name: 'studio', package: '@verifier/contrib-select' })

wireRemoteAddon({
  name: 'cloud',
  package: '@verifier/contrib-bad',
  serverUrl: 'https://cloud.example.com',
  uses: { '@verifier/contrib-select': 'studio' },
  local: {
    package: '@verifier/contrib-notify',
    contributors: ['notifier', 'logger-prefix'],
  },
})
