---
'@pikku/core': patch
---

wireGateway: allow `adapter` to be a factory `(services) => GatewayAdapter | Promise<GatewayAdapter>`, resolved lazily on first inbound request (webhook/websocket) or gateway start (listener) and cached. Real platform adapters (WhatsApp Cloud API, Slack) need secrets that only exist after boot, while wireGateway runs at module load — a factory bridges that. Factory adapters register the GET verify route unconditionally since verifyWebhook can't be probed before first resolve.
