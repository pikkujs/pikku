---
'@pikku/core': patch
---

fix: stop leaking internal error detail and bound the request body size

HTTP error responses no longer forward an error's `payload` or its raw `message` for
registered 5xx errors — those responses carry the registered error message instead, so an
internal error that happens to hold a `payload` cannot leak it to the client. Errors
registered with a 4xx status keep their message and payload, and `exposeErrors` still
surfaces the full detail outside production.

`PikkuFetchHTTPRequest` now caps how much of a request body it buffers, rejecting the
declared `content-length` up front and measuring the stream as it arrives so a lying or
absent header cannot exhaust memory. Exceeding the limit throws `PayloadTooLargeError`
(413). The ceiling defaults to 10MB and is configurable via the new `maxBodySize` option on
the constructor and on `RunHTTPWiringOptions`.
