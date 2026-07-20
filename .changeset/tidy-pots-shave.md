---
'@pikku/core': patch
'@pikku/cli': patch
---

Enforce authorization consistently across `pikku*` primitives.

- `pikkuAIAgent` now enforces `permissions` (previously accepted but never
  checked) and gains `auth` and `scopes`. Scopes are checked before permissions.
  `auth` defaults to `false`, matching `pikkuSessionlessFunc`, since agents are
  typically invoked from an already-authenticated function or from sessionless
  contexts such as crons and queue workers.
- `pikkuWorkflowFunc` / `pikkuWorkflowComplexFunc` schema config gains `auth`
  and `scopes` alongside `permissions`.
- `pikkuScenario` no longer accepts `auth`, `scopes`, or `permissions` —
  scenarios drive the app as actors and authorize per step.
- `wireGateway` no longer accepts `permissions`. A gateway proxies to an agent,
  so access is governed by normal auth plus the target agent's own rules.
- Removed the dead `permissions` field from `CoreWorkflow`, which was never read.

Closed two paths that reached user code without authorization:

- Gateway handlers were invoked directly, so a handler's own `auth`, `scopes`
  and `permissions` were never evaluated. Webhook, websocket and listener
  gateways now invoke the handler through the function runner. Handlers are
  sessionless by default (inbound gateway traffic is platform-authenticated by
  the adapter, not session-bearing); declare `auth: true` to require a session.
  A gateway's own `auth` field is now honoured too — it was previously ignored.
  Gateway middleware runs before the gate, so `wire.setSession()` in gateway
  middleware — the idiomatic way to map a verified platform sender to a user —
  is visible to the handler's `auth` and `scopes`.
- Resuming a suspended agent run (`resumeAIAgentSync`, `resumeAIAgent`) checked
  run ownership but never re-ran the agent's own gate, so a scope or permission
  revoked while a run was suspended did not prevent the caller from resuming it
  and approving its pending tool calls. Both now re-run `assertAgentAuthorized`
  before any state is mutated.
