---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/console': patch
'@pikku/addon-console': patch
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

Modes are resolved at generation time into the credentials meta, so the console's connect flow reflects the wiring rather than the addon's default.

The project's own credentials are registered into pikku state from the generated credentials file, so `wire.getCredential` resolves an app-level singleton the same way it resolves an addon's.

`pikku new addon` no longer requires a `pikku.config.json` in the working directory. Scaffolding an addon is something you do before a project config exists, so the command now reads one when it is there and falls back to the working directory when it is not.

An addon's `pikkuAddonWireServices` factory now declares the same service contract its singleton factory does: what it destructures off the parent's bag is required, and what it returns is built by the addon. Before, a service an addon built per wire was demanded from the consumer, and a wire-only addon declared no contract at all.
