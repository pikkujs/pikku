---
'@pikku/cli': patch
---

Git output is now decoded as UTF-8 once, after all chunks arrive, instead of per chunk. A multi-byte character split across a chunk boundary used to become U+FFFD, so `pikku validate` falsely reported a large non-ASCII migration (for example 26 MB of Arabic text) as modified against `origin/main`, and the deploy guard refused the deploy.
