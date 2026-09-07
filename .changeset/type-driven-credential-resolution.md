---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/console': patch
'@pikku/addon-console': patch
---

A wiring can now decide whether an addon's credential is per-user, deployment-wide, or read from a secret

`wireAddon`'s `credentialOverrides` takes an object as well as a rename string:

```ts
wireAddon({
  name: 'gmail',
  package: '@pikku/addon-gmail',
  credentialOverrides: {
    gmailOAuth: { mode: 'wire' }, // each user connects their own
    calendarOAuth: { name: 'CAL', mode: 'singleton' },
    driveOAuth: { secret: 'DRIVE_TOKENS' }, // static, from the vault
  },
})
```

An addon author declares a default with `defineCredential`; the deployment decides, so one addon serves both a per-user product and a single team account.

The wire credential service now resolves each credential by what it _is_ rather than by what a lookup returned: `wire` reads only the user's value, `singleton` reads the deployment's, `secret` reads the vault. A per-user credential can no longer pick up a platform-level value because the user has not connected — which, before, would have quietly run someone's request against the deployment's own account.

Modes are resolved at generation time into the credentials meta, so the console's connect flow reflects the wiring rather than the addon's default.

A credential a wiring points at a secret is marked as such in the meta, so the console shows it as configured in the vault rather than offering a connect flow nobody can use. And the project's own credentials are registered into pikku state from the generated credentials file, so `wire.getCredential` resolves an app-level singleton the same way it resolves an addon's.
