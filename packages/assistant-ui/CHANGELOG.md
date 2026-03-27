# @pikku/assistant-ui

## 0.12.3

### Patch Changes

- f85c234: Add unified credential system with per-user OAuth and AI agent pre-flight checks

  - Unified CredentialService with lazy loading per user via pikkuUserId
  - wire.getCredential() for typed single credential lookup
  - MissingCredentialError with structured payload for client-side connect flows
  - Console UI: Global/Users credential tabs, per-user OAuth connect/revoke
  - AI agent pre-flight check: detects missing OAuth credentials from addon metadata, shows "Connect your accounts" prompt before chat
  - CLI codegen: generates credentialsMeta per addon package for runtime lookup
  - Vercel AI runner: catches MissingCredentialError as runtime fallback

## 0.12.2

### Patch Changes

- cc4a8e0: Show friendly error messages in agent chat instead of silently failing with a loading spinner

## 0.12.1

### Patch Changes

- 387b2ee: Rework agent chat UI with approval flows, tool call error badges, hideToolCalls option, and non-streaming runtime support
