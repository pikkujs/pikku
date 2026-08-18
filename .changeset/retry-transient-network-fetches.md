---
'create-pikku': patch
---

fix(create): retry a template download that failed on a blip

`create-pikku` asked api.github.com for a template tarball exactly once. A 504
from it — which that endpoint returns often enough to matter — ended the
scaffold with "Failed to download templates", and in CI that reads as a broken
pull request rather than as the weather.

Transient failures (5xx, 429, connection resets, `fetch failed`) are now
retried three times with backoff. A 404 is not transient: a template or branch
that is genuinely gone still fails on the first attempt, so a deleted branch
reports immediately instead of after a round of retries.
