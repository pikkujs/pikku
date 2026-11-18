---
'@pikku/addon-altcha': patch
---

The ALTCHA used-challenge table stores `expiry` as a `timestamptz` instead of an epoch-millisecond `integer`, which Postgres's 32-bit `integer` column cannot hold.
