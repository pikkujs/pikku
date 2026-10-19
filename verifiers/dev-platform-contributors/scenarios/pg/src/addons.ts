import { wireAddon } from '#pikku/addon'

wireAddon({
  name: 'select',
  package: '@verifier/contrib-select',
  contributors: ['store-postgres', 'store-sqlite', 'queue-real', 'queue-noop'],
})
