import { wireAddon } from '#pikku/addon'

wireAddon({
  name: 'bad',
  package: '@verifier/svc-bad',
  providers: ['needsGhost'],
})
