---
'@pikku/cli': patch
---

`pikku new addon` now declares a per-user addon's client (a credential, OAuth or delegated-login addon) on `Services` instead of `SingletonServices`, and no longer writes `forceRequiredServices` for it. The client is built per request in `createWireServices` from the caller's credential, but typed as a singleton every function read only singletons, was marked `singletonServicesOnly`, and core skipped `createWireServices`, so the credential was never read and nothing reported it. A shared-secret or no-auth addon is unchanged: its client is still a singleton. Addons already generated need the same two edits, moving the client onto `Services` in `types/application-types.d.ts` and removing `forceRequiredServices` from `pikku.config.json`.
