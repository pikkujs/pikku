---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/ai-vercel': patch
---

Widen the generated agent HTTP surface, and guard attachment downloads against SSRF.

`agentCaller` and `agentStreamCaller` declared only `message`, `threadId` and
`resourceId` (plus `context` on the stream route), so `attachments`, `model`,
`temperature` — all accepted by `AIAgentInput` — were unreachable over the
shipped HTTP contract. No deployed app could send an attachment or a per-request
model override. Both callers now share an `AgentCallerInput` type covering every
optional field and forward each one to the RPC.

Both callers declare that shape **inline** in the generic position rather than
behind a shared named alias: the schema extractor only reads type literals there
and synthesises the schema name from the function name. Behind an alias it
records an `inputSchemaName` with no schema generated for it, and every agent
HTTP call then fails at runtime with `MissingSchemaError`.

Widening that surface makes caller-supplied attachment URLs reachable, which is
an SSRF vector: the AI SDK downloads attachment URLs **server-side** whenever the
model cannot consume them natively, using an unguarded `fetch`. A caller could
point an attachment at the cloud metadata endpoint or another internal host and
have the response relayed into the model's context. `VercelAIAgentRunner` now
passes an `experimental_download` implementation backed by `safeFetch` (which
refuses private/internal hosts and non-HTTP schemes, and re-validates every
redirect hop) to both `streamText` and `generateText`. URLs the model supports
natively are passed through untouched, so the provider still fetches those
itself.

The runner takes an optional `allowedAttachmentHosts` allowlist, carried across
`withApiKey`. `safeFetch` is now exported from `@pikku/core/safe-fetch`.
