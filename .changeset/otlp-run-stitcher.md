---
'@pikku/core': patch
---

New subpath `@pikku/core/otlp/runs`: `createRunStitcher` turns the span frames an OTLP sink receives (`onSpanStart`, `exportSpans`) into runs, hops, a per-hop database summary (late spans counted in `dropped`), outcomes and health, as JSON events stamped with `seq` and `at`, plus a `snapshot()` whose views carry the seqs of their events. Attributes are default-deny (the exporter's allow-list). Pure: the caller passes the time, one clock for every call. With start frames the first span seen for a trace is the root at once (a foreign parent included); a failed producer under a root that ends ok is carried as `failure` on `run.finished`; late database updates are coalesced per hop.
