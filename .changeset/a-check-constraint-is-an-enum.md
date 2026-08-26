---
'@pikku/cli': patch
---

A Postgres `CHECK (col IN (…))` constraint now generates a string-literal union, the way a native enum and the SQLite equivalent already did. SQL comments inside the value list are ignored rather than corrupting the union parsed out of it.
