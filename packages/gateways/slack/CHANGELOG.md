# @pikku/gateway-slack

## 0.12.3

### Patch Changes

- e2286b4: SlackGatewayAdapter now enforces request-signature verification: `verifyWebhook` HMAC-verifies every inbound webhook (including url_verification) against the configured `signingSecret` using the raw request body, rejecting invalid/missing/stale signatures with UnauthorizedError. Previously `signingSecret` was accepted but never used, leaving webhook endpoints open to spoofed events.
- Updated dependencies [1f3f510]
  - @pikku/core@0.12.59

## 0.12.2

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.1

### Patch Changes

- 87433f0: Make signingSecret required in SlackGatewayAdapterOptions to prevent accepting unverified webhook payloads.
- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
- Updated dependencies [b973d44]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
  - @pikku/core@0.12.9

## 0.12.0

### Minor Changes

- Initial release of Slack gateway adapter for Pikku
