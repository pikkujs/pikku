---
'@pikku/core': patch
'@pikku/skills': patch
---

`safeFetch` no longer lets an `allowedHosts` match skip its private-address and DNS checks: they run on every hop unless the host matches the new `privateHosts` option, so an allowlisted name resolving to `10.0.0.1` or `169.254.169.254` is refused. `allowedHosts` and secret `allowedHosts` share a new matcher (`hostMatches`, `validateHostPattern` in `@pikku/core/safe-fetch`) with `host:port` and a single leading `*.` wildcard (at least two labels, never over an IP). New `safeFetch` options `fetch` (injected transport), `allowHttp` (which hosts may use plain `http:`) and `caller` (named in refusals). Refusals throw `NetworkHostNotAllowedError` (`host`, `reason`: `not-declared` | `private-address` | `scheme` | `redirect`), whose message names hosts only. `config.webhook.privateHosts` lets webhook delivery reach an internal receiver.

Breaking: a private host listed only in `allowedHosts` (webhook config, `voiceInput` `allowedAudioHosts`, `safeDownload`) is now refused; invalid `allowedHosts` entries throw. See docs/MIGRATION.md.
