---
'@pikku/gateway-slack': patch
---

SlackGatewayAdapter now enforces request-signature verification: `verifyWebhook` HMAC-verifies every inbound webhook (including url_verification) against the configured `signingSecret` using the raw request body, rejecting invalid/missing/stale signatures with UnauthorizedError. Previously `signingSecret` was accepted but never used, leaving webhook endpoints open to spoofed events.
