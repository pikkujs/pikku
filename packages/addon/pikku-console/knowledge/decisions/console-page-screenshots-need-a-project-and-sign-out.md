---
type: decision
title: Page screenshots exist only where a project meta path is present, and each page is captured signed out
description: pageScreenshotService is constructed only inside the metaBasePath branch, so screenshot-pages throws LocalEnvironmentOnlyError elsewhere; the service opens each page without a session
tags: console, screenshots, local-only
---

# Page screenshots exist only where a project meta path is present, and each page is captured signed out

`screenshotPages` (`packages/addon/pikku-console/src/functions/screenshot-pages.function.ts`)
is gated by `pikku:console:pages:screenshot` (`screenshot-pages.function.ts:16`).
It throws `LocalEnvironmentOnlyError` when no `pageScreenshotService` is wired
(`screenshot-pages.function.ts:18-21`).

The service is created only inside `if (metaBasePath)` in the console services
(`packages/addon/pikku-console/src/services.ts:77` and `services.ts:94-97`), so the
gate is whether a project meta path exists, not a separate environment check.

The function description says it opens each page "signed out"
(`screenshot-pages.function.ts:14`). The service comment says the same
(`packages/addon/pikku-console/src/services/page-screenshot.service.ts:55`), and it
opens each page with `driver.openPageSession(baseUrl)` (`page-screenshot.service.ts:91`),
which takes no session argument.

**What this rules out:** capturing a page as a signed-in user through this function,
and running it where no project meta path is available.
