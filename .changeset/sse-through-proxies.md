---
'@pikku/core': patch
'@pikku/cli': patch
---

Event-stream responses pass through `applyWebResponse` without being read, so an SSE route can proxy another stream. HTTP responses gain `onClose`, which `executeRoute` uses to tell an SSE route's event hub when the client leaves. `pikku all` wires the console's `/meta/stream` route to `console:streamMetaChanges`.
