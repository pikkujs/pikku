---
'@pikku/cli': minor
---

feat(cli): gate the remote internal RPC scaffold behind `scaffold.remoteRpc`

The remote internal RPC handler (`rpc-remote.gen.ts` — a `pikku-remote-internal-rpc`
queue worker plus a `/remote/rpc/:rpcName` HTTP endpoint) was generated for
**every** project unconditionally, because `remoteRpcWorkersFile` defaulted to
`<scaffoldDir>/rpc-remote.gen.ts` with no guard. Projects that never invoke RPCs
across a deployable boundary (the call resolves inline, or service-to-service
goes through a generated `PikkuRPC`/`PikkuFetch` HTTP client) ended up
registering an idle queue worker they never dispatch to.

Remote RPC is now an opt-in scaffold feature, consistent with `rpc`, `agent`,
`workflow`, `console`, and `events`:

```jsonc
// pikku.config.json
"scaffold": { "remoteRpc": "no-auth" }
```

or via the CLI: `pikku enable remote-rpc`.

When `scaffold.remoteRpc` is unset, `remoteRpcWorkersFile` is left undefined and
`pikkuRemoteRPC` skips generation (same guard the other scaffolds already use) —
no `pikku-remote-internal-rpc` queue worker, no `/remote/rpc/:rpcName` endpoint.

**Migration:** projects that rely on pikku's cross-deployable remote RPC
transport must add `"scaffold": { "remoteRpc": "no-auth" }` (or run
`pikku enable remote-rpc`) to keep the handler. The `remote-rpc-pg` /
`remote-rpc-redis` templates (via the shared `functions` template) are updated
accordingly.
