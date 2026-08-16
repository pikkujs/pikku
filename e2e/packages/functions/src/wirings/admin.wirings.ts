import { wireAddon } from '#pikku/pikku-types.gen.js'

wireAddon({
  name: 'admin',
  package: '@pikku/addon-admin',
  globalCredentials:
    'administering credentials means setting and clearing any of them, for any user, so it cannot be scoped to a declared set',
})
