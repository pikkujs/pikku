---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/console': patch
'@pikku/addon-console': patch
'@pikku/better-auth': patch
---

A wiring can now decide whether an addon's credential is per-user or deployment-wide

`wireAddon`'s `credentialOverrides` takes an object as well as a rename string:

```ts
wireAddon({
  name: 'gmail',
  package: '@pikku/addon-gmail',
  credentialOverrides: {
    gmailOAuth: { mode: 'wire' }, // each user connects their own
    calendarOAuth: { name: 'CAL', mode: 'singleton' },
  },
})
```

An addon author declares a default with `defineCredential`; the deployment decides, so one addon serves both a per-user product and a single team account.

The wire credential service now resolves each credential by what it _is_ rather than by what a lookup returned: `wire` reads only the user's value, `singleton` reads the deployment's. A per-user credential can no longer pick up a platform-level value because the user has not connected — which, before, would have quietly run someone's request against the deployment's own account.

A credential is never read from the secret vault. The wire credential service no longer takes a `SecretService` at all, so the only way a credential arrives is the one its mode names — the user's own value, or the deployment's.

Modes are resolved at generation time into the credentials meta, so the console's connect flow reflects the wiring rather than the addon's default.

The project's own credentials are registered into pikku state from the generated credentials file, so `wire.getCredential` resolves an app-level singleton the same way it resolves an addon's.

`pikku new addon` no longer requires a `pikku.config.json` in the working directory. Scaffolding an addon is something you do before a project config exists, so the command now reads one when it is there and falls back to the working directory when it is not.

An addon's `pikkuAddonWireServices` factory now declares the same service contract its singleton factory does: what it destructures off the parent's bag is required, and what it returns is built by the addon. Before, a service an addon built per wire was demanded from the consumer, and a wire-only addon declared no contract at all.

An OAuth2 credential now implies its app secret, so nobody hand-writes one. The client id and secret an OAuth app needs is the same shape every time — `OAuth2AppCredential`, which is what the runtime already reads it as — so the inspector registers a secret for each credential's `appCredentialSecretId`. A hand-written `defineSecret` covering that id still wins, so an author who wants their own description or `docsUrl` keeps it. The derived secret is optional, matching what every hand-written declaration chose: an addon that also authenticates by API key must still deploy without an OAuth app configured.

`optional` now means a secret is not reported as missing. `getMissing()` filtered on "not configured" alone, so a secret whose declaration said absence was supported still showed up on the list of things a deployment had to go and supply — burying the ones that genuinely were. `getAllStatus()` still reports it, flagged `optional`.

An OAuth2 secret carries its declaration's `optional` through code generation, to the app credential and to the token store alike: nobody connects without the client id and secret, so a deployment allowed to omit the app is never asked for its tokens either. That branch never looked at the flag before.

`credentialOAuthProviders` treats an app secret that resolves `undefined` as unconfigured. An optional secret resolves rather than throws, so the absence arrived past the `catch` that was meant to skip the provider — and `.reveal()` on it threw a `TypeError` that took every `getSession` down with it, which is the exact failure that code exists to prevent.
