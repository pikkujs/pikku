---
'@pikku/core': patch
---

Carry the trace id across a remote RPC hop

`ContextAwareRPCService` sent the wire's trace id as `x-trace-id`, but the HTTP
runner on the receiving end reads `x-request-id` — the header every other sender
uses, including `buildRemoteHeaders`, which every deployment service goes
through. The receiving side therefore ignored the incoming id and generated a
fresh one, so a trace broke at each remote RPC boundary instead of spanning it.
Remote RPC now sends `x-request-id` too.
