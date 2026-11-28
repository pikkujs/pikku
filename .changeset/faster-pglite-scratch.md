---
'@pikku/cli': patch
---

`pikku db` commands on the embedded Postgres database are much faster. The first empty database is saved to `pikku/pglite-<version>.tar.gz` in your cache directory (`XDG_CACHE_HOME`, otherwise `~/.cache`) and later ones start from that copy instead of running `initdb`. Within a command, unchanged migrations are also replayed only once.
