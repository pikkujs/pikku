---
'@pikku/core': patch
'@pikku/bun-server': patch
---

Request hot path. New `trustedFraming` option on `PikkuFetchHTTPRequest` (default off); `PikkuBunServer` sets it. With it, a request body whose `content-length` is strictly digits, within `maxBodySize`, with no `transfer-encoding` is read with the native `arrayBuffer()` (size re-checked after the read; every other body and every other runtime keeps the bounded reader and its 413). `OtlpLogger` does no record work while the sink registry is empty. An HTTP request's trace and span ids are drawn when first read (error `errorId`, scoped logger, span, queued job, audit) instead of on every request. The permission runner reuses one secretless view per singleton services object, and the wire credential service is built on first use.
