# @pikku/addon-admin

Administration for a Pikku application, as ordinary namespaced RPCs: the user
directory, roles and scopes, credentials, and the audit trail.

It touches nothing but the services your application already has, so it can be
wired into a deployed serverless unit and called from your own admin screens.

## Install

```bash
npm install @pikku/addon-admin
```

```ts
import { wireAddon } from '#pikku/pikku-types.gen.js'

wireAddon({
  name: 'admin',
  package: '@pikku/addon-admin',
  expose: true,
  globalSecrets:
    'administering secrets and variables means reading, writing and checking any name an operator supplies at runtime, so it cannot be scoped to a declared set',
  globalCredentials:
    'administering credentials means setting and clearing any of them, for any user, and reporting whether the caller has connected the OAuth credentials agents need, which other addons declare, so it cannot be scoped to a declared set',
})
```

`globalSecrets` is required for the `admin:secret*` and `admin:variable*`
functions, and `globalCredentials` for the `admin:credential*` ones. An addon is
otherwise handed a `SecretService` and `CredentialService` scoped to the names it
declares itself, and this one declares none — so without the opt-outs every call
is refused with `Access denied to secret key` or finds nothing. Leave them off
if you only want users, scopes and audits.

Every function carries its own `admin:*` scope, so a role can grant reading the
directory without granting the ability to ban anyone. Note the absence of
`scopes` on `wireAddon`: addon scopes are required _in addition to_ a function's
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

### Inviting someone

`admin:inviteUser` `{ email, name?, role? }` is the whole invite in one call:
it creates the account without a password when the email has none, mails a
sign-in link, then grants `role` if one is given. It answers
`{ userId, created }`, and calling it again for the same email sends a new
link. It needs better-auth's `magicLink()` plugin with sign-up disabled, so the
link only admits the account the invite created:

```ts
import { magicLink } from 'better-auth/plugins'

betterAuth({
  plugins: [magicLink({ disableSignUp: true, sendMagicLink })],
})
```

The call needs `admin:users:create`; granting a role also needs
`admin:scopes:manage`. A refusal's message starts with a code a client can
match on: `USER_BANNED` (422), `UNKNOWN_ROLE` (400, checked before anything is
created) or `MAIL_FAILED` (422, the account is kept and no role is granted).

`admin:audit:read` needs an audit sink that can be read back. Both report their
absence rather than failing.

## Docs

https://pikku.dev/docs
