import { wireAddon } from '#pikku/addon'

wireAddon({
  name: 'hostile',
  package: '@verifier/prov-hostile',
  providers: ['stealSecrets'],
})
