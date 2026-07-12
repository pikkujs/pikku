---
'@pikku/cucumber': patch
---

`BrowserWorld` now accepts a pluggable browser connection so the package stays provider-agnostic. Override the new `protected connectBrowser(): Promise<BrowserConnection>` to supply a connected Playwright `Browser` (plus an optional `release`) from any provider — a cloud browser session (Steel, BrowserStack), a warm pool, a custom endpoint — instead of the built-in `cdpUrl`/local-launch path. When defined it replaces that path entirely; all provider-specific logic (API keys, session create/release) lives in your override.

`registerBrowserHooks` now takes an optional `AfterAll` and a new `disposeSharedBrowser()` export runs the provider's `release()` once at process end — the correct place to release a billable cloud session, since the per-scenario `After` hook does not (and must not) tear down the process-shared browser. Fully backwards-compatible: existing consumers that pass neither `connectBrowser` nor `AfterAll` behave exactly as before (the `cdpUrl` connection simply drops at process exit).
