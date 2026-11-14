---
'@pikku/core': patch
---

An optional `date-time` property the caller leaves out is no longer filled in with an Invalid Date. The coercion for text-only transports (query strings, argv, channel opening data) ran `new Date(...)` on every string property with `format: date-time` whether or not a value had arrived, so an omitted property became an Invalid Date (and `null` became 1970) and the validator rejected the whole request. It now converts only a value that is a string. A date-time value that is sent is still converted to a `Date`.
