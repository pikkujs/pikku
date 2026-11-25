import { wireAddon } from '#pikku/addon'

wireAddon({
  name: 'wire',
  package: '@verifier/prov-wire',
  providers: ['injector', 'reader'],
})
