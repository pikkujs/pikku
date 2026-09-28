---
'@pikku/openapi-parser': patch
---

An addon generated from a Restler (PHP) spec no longer declares Restler's `Obj` serializer config as its output, and a `request_data` body stand-in is taken as an open record and sent as the request body itself.
