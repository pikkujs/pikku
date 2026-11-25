import { wireAddon } from '#pikku/addon'

// Opted in by name. `unused` is declared by the addon and left out on purpose.
wireAddon({
  name: 'notify',
  package: '@verifier/svc-notify',
  providers: ['notifier', 'loggerPrefix', 'cache', 'blob'],
})

// `queueReal` and `queueNoop` provide different keys, and this project reaches
// only `queueNoop`: the other is neither run nor imported. `store` needs a
// database this project does not have, and nothing reaches it either.
wireAddon({
  name: 'select',
  package: '@verifier/svc-select',
  providers: ['store', 'queueReal', 'queueNoop'],
})
