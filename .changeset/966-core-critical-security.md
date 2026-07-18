---
'@pikku/core': patch
---

Security: SSRF-harden outgoing webhook delivery and voice-input audio fetch (validate scheme + block private/internal hosts, re-validate every redirect hop via a shared `safeFetch`); stop the channel stream-middleware cache from reusing an earlier run's per-invocation middleware closures across runs.
