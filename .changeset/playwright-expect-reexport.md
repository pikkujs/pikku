---
'@pikku/playwright': patch
---

Re-export `expect` from `@playwright/test`, so a scenario step asserts through a retrying web-first matcher instead of sampling a locator once and hand-rolling the wait. `@playwright/test` is already this package's peer dependency, so a consumer reaches it here rather than depending on the test runner directly.
