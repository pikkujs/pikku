---
'@pikku/cli': patch
---

Report a statically-imported stubbed package once, not once per service.

`SERVICE_MODULE_MAP` now lists the AI SDKs under both `agentRunner` and `ai`, and
`staticStubbedImports` pushed a finding for every service whose patterns matched — so a
single `@pikku/ai-vercel` import was reported twice, saying the same thing about one line
of code. It now stops at the first service that stubs the module.
