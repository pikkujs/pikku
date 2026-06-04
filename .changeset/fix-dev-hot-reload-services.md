---
"@pikku/cli": patch
---

Fix race condition in `pikku dev` where hot-reload codegen replaced live user services with CLI-internal services.

During a file-watch triggered re-run of `allWorkflow`, `runAllWithCommandState` unconditionally overwrote `singletonServices` with the CLI's own services object (which has `config` but no `kysely`, no content server, etc.). Any request that arrived during codegen — e.g. an auth callback — would crash because `kysely` was undefined.

Fix: detect the hot-reload case (`previousSingletonServices` exists and differs from the CLI object), then build a hybrid — spread the live user services and overlay only `config` from the CLI. Codegen gets the paths it needs; concurrent requests continue to see the real services.
