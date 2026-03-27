---
"@pikku/core": minor
"@pikku/cli": minor
"@pikku/assistant-ui": minor
"@pikku/console": minor
"@pikku/addon-console": minor
"@pikku/ai-vercel": patch
"@pikku/kysely": patch
---

Add unified credential system with per-user OAuth and AI agent pre-flight checks

- Unified CredentialService with lazy loading per user via pikkuUserId
- wire.getCredential() for typed single credential lookup
- MissingCredentialError with structured payload for client-side connect flows
- Console UI: Global/Users credential tabs, per-user OAuth connect/revoke
- AI agent pre-flight check: detects missing OAuth credentials from addon metadata, shows "Connect your accounts" prompt before chat
- CLI codegen: generates credentialsMeta per addon package for runtime lookup
- Vercel AI runner: catches MissingCredentialError as runtime fallback
