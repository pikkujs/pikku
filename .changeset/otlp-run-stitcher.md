---
'@pikku/core': patch
---

New subpath `@pikku/core/otlp/runs`: `createRunStitcher` turns the span frames an OTLP sink receives (`onSpanStart`, `exportSpans`) into runs, hops, a per-hop database summary, outcomes and health, as JSON events stamped with `seq` and `at`, plus a `snapshot()`. Pure: the caller passes the time.
