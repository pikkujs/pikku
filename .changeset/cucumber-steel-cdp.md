---
'@pikku/cucumber': patch
---

browser world: connect to a remote CDP browser (e.g. Steel) via `cdpUrl` /
`XBROWSER_CDP_URL` instead of launching a local chromium. On this path the app is
reached at its public edge, so the loopback host-resolver mapping is skipped. Lets
CPU/RAM-capped sandboxes run smoke/scenario suites against a shared remote browser.
