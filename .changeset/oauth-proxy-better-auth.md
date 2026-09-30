---
'@pikku/better-auth': patch
'@pikku/cli': patch
---

`pikkuBetterAuth` now signs users in through a host's OAuth proxy when the stage carries `OAUTH_PROXY_SECRET`, `OAUTH_PROXY_URL` and `OAUTH_PROXY_PROVIDERS` (plus the `GOOGLE_OAUTH` / `GITHUB_OAUTH` client id for each listed provider, and an optional `OAUTH_PROXY_KEY_ID`). With none of them set nothing changes. With only some set, the app fails at start naming what is missing. A provider the app also configures itself is an error rather than an override. `pikku` now declares these as optional secrets and variables so a stage that has none of them still deploys.
