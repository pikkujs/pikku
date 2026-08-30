# @pikku/addon-admin

Administration for a Pikku application, as ordinary namespaced RPCs: the user
directory, roles and scopes, credentials, and the audit trail.

Separate from `@pikku/addon-console` on purpose. The console addon exists to be
served alongside a running dev server — it reads generated metadata, project
source and knowledge notes from disk. This one touches nothing but the services
your application already has, so it can be wired into a deployed serverless
unit and called from your own admin screens without the console anywhere in
sight.

## Install

```bash
npm install @pikku/addon-admin
```

```ts
import { wireAddon } from '#pikku/pikku-types.gen.js'

wireAddon({
  name: 'admin',
  package: '@pikku/addon-admin',
  globalCredentials:
    'administering credentials means setting and clearing any of them, for any user, so it cannot be scoped to a declared set',
})
```

`globalCredentials` is required for the `admin:credential*` functions. An addon
is otherwise handed a `CredentialService` scoped to the credentials it declares
itself, and this one declares none — so without the opt-out every credential
call finds nothing. Leave it off if you only want users, scopes and audits.

Every function carries its own `admin:*` scope, so a role can grant reading the
directory without granting the ability to ban anyone. Note the absence of
`scopes` on `wireAddon`: addon scopes are required *in addition to* a function's
own, so declaring `admin` there would force the umbrella grant on every caller.

`admin:users:*` needs better-auth wired, and banning additionally needs its
`pikkuBan()` plugin from `@pikku/better-auth` for the columns to exist:

```ts
import { pikkuBan } from '@pikku/better-auth'

betterAuth({ plugins: [pikkuBan()] })
```

better-auth's own `admin()` plugin is neither needed nor wanted here. These
functions work through the internal adapter, and each is already gated by its
own `admin:*` scope — `admin()` would only add a second check against a `role`
column that has to be kept in step with the scopes it duplicates.

`admin:audit:read` needs an audit sink that can be read back. Both report their
absence rather than failing.

## Docs

https://pikku.dev/docs
