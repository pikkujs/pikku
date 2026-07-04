---
'@pikku/better-auth': patch
'@pikku/cli': patch
'@pikku/console': patch
---

Dev quick login for the console when running locally (#857). The better-auth
catch-all handler now serves `<basePath>/dev/quick-login` when
`PIKKU_DEV_QUICK_LOGIN` is set AND the request host is a loopback address:
GET reports availability, POST idempotently seeds an `admin@pikku.dev` admin
user and returns a signed-in session. `pikku serve` / `pikku dev` enable the
flag by default (set `PIKKU_DEV_QUICK_LOGIN=false` to opt out), and the
console login screen shows a one-click "Quick login as admin@pikku.dev"
button whenever a local server advertises the endpoint.
