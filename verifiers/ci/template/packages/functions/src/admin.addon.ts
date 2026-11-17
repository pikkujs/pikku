import { wireAddon } from '#pikku/addon'

wireAddon({
  name: 'admin',
  package: '@pikku/addon-admin',
  globalSecrets:
    'administering secrets and variables means reading, writing and checking any name an operator supplies at runtime, so it cannot be scoped to a declared set',
  globalCredentials:
    'administering credentials means setting and clearing any of them, for any user, and reporting whether the caller has connected the OAuth credentials agents need, which other addons declare, so it cannot be scoped to a declared set',
})
