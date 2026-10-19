---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
---

Remote addon calls now carry a function version. `pikku versions check` covers `remote: true` functions. `pikku sdk` records each contract function's `versions` and `latestVersion`, types `fn` and every `fn@vN` in the remote map, and packs the contract's schemas so `--bump-from` can tell a loosened contract (minor) from a tightened one (major). A consumer sends an explicit `ns:fn@vN` as it is and a bare `ns:fn` to the newest version in its SDK. On the host, `rpc.exposed` answers a version it no longer serves with a 404 `RPCNotFoundError` instead of falling back to the latest. `RPCNotFoundError` takes an optional message.
