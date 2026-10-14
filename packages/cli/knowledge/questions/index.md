---
type: overview
title: Questions
description: Things asked of the pikku CLI and not yet answered
---

# Questions

Something asked and not yet answered. A question earns a note when the code
currently makes a choice that nobody has defended. The choice stays, and the
doubt gets recorded.

<!-- pikku:knowledge-index -->
- [Does the edge runtime check ever receive an app's allowInMemory list?](does-the-edge-verifier-ever-receive-an-allow-in-memory-list.md) — The verifier accepts an allowInMemory option and the edge rule reads it, but no code in the CLI sets it, so a class an app lists would still be flagged at build time
- [How should conflicting addon auth flags resolve when a scaffold is generated?](how-are-conflicting-addon-auth-flags-resolved.md) — resolveAddonAuth checks the delegated spec first, then none, then shared, then credential or oauth, so a --secret with an --oauth flag falls through to the credential path
- [Is the provider signature the only check on a generated webhook route?](is-the-provider-signature-the-only-webhook-check.md) — The generated webhook source route is auth false, and the core receiver adds an enabled-source check and a signature check that depends on whether the source declares verify
- [Is the raw CLI channel safe with auth false?](is-the-raw-cli-channel-safe-with-auth-false.md) — cliRaw is declared auth false yet runs every command as the channel session, so its safety rests on how the channel upgrade authenticates, which this file does not show
- [Should pikku new function default to the sessionless template?](should-a-new-function-default-to-sessionless.md) — pikku new function writes a sessionless function when no type is given, and writes only the file, so whether it is callable depends on wiring the command does not do
- [Should addon config factories see the app's full secret service?](should-addon-config-factories-see-the-full-secret-service.md) — pikkuAddonConfig hands an addon's config factory a TypedSecretService over the parent app's secret service, with no per-addon scope applied in the generated code
- [Should session tables be kept out of the scenario baseline by default?](should-session-tables-be-kept-out-of-scenario-baseline.md) — The baseline module documents session tables as belonging in keep, but the one caller passes only the user's config, so nothing keeps them unless the project does
- [Should a newly scaffolded permission grant access by default?](should-the-permission-scaffold-grant-access-by-default.md) — pikku new permission writes a permission whose body returns true with a TODO, so the scaffold grants every caller until someone edits it
<!-- /pikku:knowledge-index -->
