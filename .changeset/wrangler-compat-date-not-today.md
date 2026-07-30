---
'create-pikku': patch
---

Stop stamping today's date into a scaffolded project's `wrangler.toml`.

`wranglerChanges` rewrote `compatibility_date` to the current date, which a released `workerd` can never honour — it lags the calendar, and answers `This Worker requires compatibility date "<today>", but the newest date supported by this server binary is "<earlier>"`, then fails to start. So `wrangler dev` was broken in every freshly created cloudflare project, and pikku's own cloudflare template CI jobs failed for the same reason.

The template's pinned `compatibility_date` is now left alone, matching how `@pikku/deploy-cloudflare` pins its own `COMPAT_DATE`. Bumping it stays a deliberate act, which is what a compatibility date is for.
