---
'@pikku/core': patch
---

Pass `application/x-protobuf` bodies, and any body with a non-identity `content-encoding` such as gzip, through to the function as raw bytes (`{ data: ArrayBuffer }`) instead of failing with a 422 or a JSON parse error. Core still does not decode them; the function does. Gzip-compressed JSON is now received as compressed bytes rather than rejected.
