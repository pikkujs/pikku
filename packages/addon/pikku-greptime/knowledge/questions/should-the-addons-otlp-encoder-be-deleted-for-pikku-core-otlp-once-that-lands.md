---
type: question
title: Should the addon's OTLP encoder be deleted for @pikku/core/otlp once that lands?
description: otlp-encode.ts duplicates the encoding on the otlp-exporter branch because core's subpath is not in this base
tags: [otlp, duplication, core]
---

# Should the addon's OTLP encoder be deleted for @pikku/core/otlp once that lands?

`src/otlp-encode.ts` is a dependency-free protobuf encoder for logs, spans and gauges.
The otlp-exporter branch has the same encoding in `@pikku/core/otlp`, which this branch's
base does not have, and the brief forbids a runtime dependency or an OTel SDK. Once that
branch lands the addon can import it and the file can go. Until then there are two
encoders. Needs an owner decision on whether the addon should wait for it.
