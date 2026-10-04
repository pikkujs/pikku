import { wireAddon } from '#pikku/addon'

/**
 * `globalCredentials` is required for the `admin:credential*` functions: an addon
 * is otherwise handed a `CredentialService` narrowed to the credentials it
 * declares itself, and this one declares none — so without the opt-out every
 * credential call finds nothing instead of failing.
 */
wireAddon({
  name: 'admin',
  package: '@pikku/addon-admin',
  globalCredentials:
    'administering credentials means setting and clearing any of them, for any user, so it cannot be scoped to a declared set',
})
