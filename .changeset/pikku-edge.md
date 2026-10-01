---
'@pikku/core': patch
'@pikku/kysely': patch
'@pikku/cloudflare': patch
'@pikku/gateway-slack': patch
'@pikku/ai-deepinfra': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/skills': patch
---

The default runtime path no longer needs `node:*`, `Buffer` or an unguarded `process`, so it loads on edge runtimes (Web APIs only). `node:async_hooks` in the function abort scope is the one built-in left in `@pikku/core`.

**Breaking:** `FileScenarioRunStore`, `scenarioArtifactContentType` and `scenarioRunSummary` leave the `@pikku/core/services` barrel because they use `node:fs`. Import them from `@pikku/core/services/file-scenario-run-store`. Pre-0.13 breaking changes still ship as a patch.

**Breaking:** the HMAC helpers in `@pikku/core/hmac` run on Web Crypto, which is async. `hmacSha256Hex`, `hmacDigest`, `verifyHmacSignature` and `verifyPublicKeySignature` now return a Promise; `timingSafeStringEqual` stays synchronous. `WebhookService.sign` and `WebhookService.verify` return a Promise, and so does `verifySlackSignature` in `@pikku/gateway-slack`: `await` them. A function-style `verify` on a webhook source may return a Promise as well. `verifyPublicKeySignature` accepts RSA and EC (P-256, P-384, P-521) PEM keys; Ed25519 and RSA-PSS keys verify as false.

`isProduction()` (and the `PIKKU_MODEL_ALIASES` and `PIKKU_ENV` reads) now ask the registered singleton services' `variables` service first, then `process.env` when `process` exists. With neither, `isProduction()` is true, so an edge deployment never exposes error details by accident. `LocalVariablesService` resolves its `process.env` default when constructed and falls back to an empty store without `process`.

Workflow invocation ids use a built-in SHA-1 and stay byte-identical. `@pikku/kysely` and the Cloudflare hibernation server use `globalThis.crypto.randomUUID()` and no `Buffer`; `@pikku/kysely` is marked `sideEffects: false`. `@pikku/ai-deepinfra` reads `DEEPINFRA_API_KEY` only when `process` exists and decodes base64 audio without `Buffer`.
