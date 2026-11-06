import { wireAddon } from '#pikku/addon'

/**
 * `globalCredentials` is required for the `admin:credential*` functions: an addon
 * is otherwise handed a `CredentialService` narrowed to the credentials it
 * declares itself, and this one declares none — so without the opt-out every
 * credential call finds nothing instead of failing.
 *
 * `expose` is what lets the flag functions answer over HTTP, and Studio's
 * Switches screen and its sync on deploy both reach them that way. Without it
 * they answer 404 and no flag can be changed. Each is still gated by an
 * `admin:flags:*` scope.
 */
wireAddon({
  name: 'admin',
  package: '@pikku/addon-admin',
  expose: [
    'flagList',
    'flagOverrides',
    'flagSetEnabled',
    'flagSetRollout',
    'flagSetOverride',
    'flagClearOverride',
    'flagSync',
    'flagPrune',
  ],
  globalCredentials:
    'administering credentials means setting and clearing any of them, for any user, so it cannot be scoped to a declared set',
})
