---
'@pikku/core': patch
'@pikku/cli': patch
---

A failed SSE stream reports the error in the protocol its client is parsing

An SSE route can now declare `streamProtocol: 'agui'`, and the generated agent
stream and resume routes do. A function that throws mid-stream then ends the
stream with a single AG-UI `RUN_ERROR` instead of Pikku's `error`/`done` frames,
which an AG-UI client could only surface as a Zod parse failure with the real
message nowhere in sight.
