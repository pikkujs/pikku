---
"@pikku/uws-handler": patch
---

fix(uws-handler): implement flushHeaders() and fix close() for SSE streams

SSE routes that subscribe-and-return immediately (e.g. /events/:topic) never
wrote HTTP headers to the client until the first channel.send() call, causing
the client's fetch() to hang indefinitely waiting for headers.

The http-runner already called response?.flushHeaders?.() after the SSE
function returned, but UWSPikkuHTTPResponse had no flushHeaders() method so it
was silently skipped.

Also fixes close() in streaming mode to write headers before res.end() when no
data has been sent yet, so the client always gets a valid HTTP response.
