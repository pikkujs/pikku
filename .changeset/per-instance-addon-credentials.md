---
'@pikku/core': patch
'@pikku/inspector': patch
---

`wireAddon` can now install the same addon package as multiple named instances, each bound to its own secret/variable/credential — finishing the previously designed-but-unwired `secretOverrides` / `variableOverrides` / `credentialOverrides` feature.

Previously two `wireAddon({ name, package })` instances of one package resolved distinct RPC namespaces but shared a single set of singleton services and one credential, so the overrides had no runtime effect. Overrides are name-aliases: the KEY is the logical name the addon reads, the VALUE is the actual project secret/variable/credential (the logical name is the default only when no override is given).

**@pikku/core (runtime):**

- `wireAddon` persists the override maps into runtime addon state.
- Addon singleton services are cached and built per `(package, namespace)` instead of per package, so each instance gets its own services object.
- `secretOverrides` / `variableOverrides` alias the `secrets` / `variables` services fed to the addon's `createSingletonServices`.
- `credentialOverrides` alias `wire.getCredential(name)` at invocation time (credentials are per-user and resolved against the project's `credentialService`).
- The active instance namespace rides on the wire, so intra-addon sibling RPC calls stay in the same instance and workflow-name prefixing uses the exact instance namespace rather than assuming one namespace per package.

**@pikku/inspector (build time):**

- Addon-declared secrets/variables are now surfaced into the project under each instance's **override target** name (one per instance) instead of the addon's shared logical name — e.g. two Slack instances require `slack_marketing_secret` and `slack_support_secret`, not a single shared `slack`. The logical name is used only when an instance provides no override.
- `validateSecretOverrides` / `validateVariableOverrides` / `validateCredentialOverrides` now validate the override **target** (the real project name) exists, instead of the logical key — matching the runtime resolution direction.
