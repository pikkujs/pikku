---
'@pikku/cli': patch
'@pikku/addon-pikku-console': patch
---

Address code-review feedback on the realtime/dev/meta stack:

- `dev` content server now streams uploads to disk (no full-buffer in memory), enforces a 50 MiB cap (configurable), supports `X-Pikku-Reaper-Token` auth, and uses `path.relative` instead of a literal `/` separator so traversal protection works on Windows.
- `dev` registers a SIGTERM handler in addition to SIGINT so supervisors (Docker, systemd) get a clean shutdown.
- `PikkuRealtime` SSE auth corrected: `EventSource` cannot send headers, so `setAuthorizationJWT` / `setAPIKey` no longer falsely claim to authenticate SSE. `subscribeToSSE` and `subscribeToTopic` accept an `SSEOptions` object with `accessToken` (appended as `?access_token=…`) and `withCredentials` (forwarded to the EventSource constructor).
- Realtime client generator validates `clientFiles.realtimeEventHubTopicsImport` against a strict character set and uses `JSON.stringify` for path interpolation — closes a generated-source injection vector if pikku.config.json comes from an untrusted source.
- `pikku meta` commands now type their state as `InspectorState` instead of `any`. This surfaced two silent bugs the casts were hiding: `pikku meta context` reported MCP/agent capabilities as always-false (wrong field paths) and `pikku meta wires queue|trigger` returned `queueName` and `eventType` that were always null (no such fields on the meta types).
- `StateDiffService.diff` rejects absolute paths and `..`-traversal so a compromised browser surface can't read arbitrary files via the console RPC.
