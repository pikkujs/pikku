import { wireAddon } from '#pikku/addon'

// Opted in by name. `unused` is registered by the addon and left out on purpose.
wireAddon({
  name: 'notify',
  package: '@verifier/contrib-notify',
  contributors: [
    'notifier-audit',
    'notifier',
    'logger-prefix',
    'blob',
    'cache',
  ],
})

// Two exclusive pairs: `when` decides which of each is selected, and the
// other's module must never be imported.
wireAddon({
  name: 'select',
  package: '@verifier/contrib-select',
  contributors: ['store-postgres', 'store-sqlite', 'queue-real', 'queue-noop'],
})
