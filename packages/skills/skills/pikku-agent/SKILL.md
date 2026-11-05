---
name: pikku-agent
description: >-
  Any AI or model call in a Pikku app: agents, chatbots, pikkuAgent, rpc.agent, ref() tools, memory, streaming, tool approval, VercelAgentRunner, providers, voice. MCP exposure is pikku-wiring.
installGroups: [core]
---

# Pikku AI Agents

**Never call a model or model SDK directly.** All AI goes through `pikkuAgent` and its runner, so the console can show it.
If the owner asks to skip that, explain what they lose and ask them to confirm first.

For how to call it, run this once: `pikku doc agent pikkuAgent`. This skill is what the compiler cannot tell you.

## Pick the reference

- Defining or invoking an agent (tools, memory, streaming, approval, threads, images): `references/agents.md`
- Wiring the runner, or pointing model strings at a provider or gateway: `references/runner-vercel.md`
- Adding speech in or out: `references/voice.md`

## An agent is a function that reaches other functions

Tools, sub-agents and workflows are supplied as `ref('domain:funcName')` handles, not imported values. The inspector resolves each ref against the generated function map, so an agent can call into another package or a `graph:*` builtin without an import cycle, and the tool menu can be filtered per session before the model sees it.

Invoke through `wire.rpc.agent` from inside a Pikku function; it carries the session, credentials and RPC depth.

## The knobs that do not mean what they look like

- **`goal` is the prompt field, and it is required.** There is no `instructions` key. `role`, `personality` and `goal` are concatenated in that order and nothing validates which text lands where; the split buys legibility only.
- **`output` is honoured only when the agent has no tools.** On a tool-calling agent the schema is silently inert. It pairs with reading an image or document into typed data: one tool-free agent, an `output` schema, the picture passed as an `attachments` entry.
- **A returned `output` is validated.** The run fails with `AgentOutputValidationError` (502, `issues` lists mismatches) instead of returning a malformed object; there is no retry. A `null` for an optional field comes back absent, so `.optional()` holds.
- **`auth` defaults to `false`**, because agents are normally invoked from an already-authenticated `pikkuFunc`. `scopes` and `permissions` are enforced either way (see `pikku-permissions`).
- **`approvalRequired` sits on the tool function, not the agent.** The run resolves `status: 'suspended'` with `pendingApprovals`; answer with `rpc.agent.approve(runId, approvals)`.
- **Model strings split on the first slash only**: `provider/model`, so `'ollama/qwen2.5:7b'` is fine. A string with no slash throws rather than defaulting to a provider.

## What NOT to do

- **Do not trust a caller-supplied `resourceId` as an owner.** The session's principal (`userId`, or `orgId` under `sessionScope: 'org'`) is prefixed onto it, so a client sub-partitions inside its own boundary and cannot read across one. A sessionless run gets an ephemeral anonymous owner.
- **Do not rely on the tool menu alone for authorization.** It is two-layer: the session decides which tools an agent sees, and the function's own `permissions` still guard the call.
- **Do not point the `'*'` provider at a single vendor.** It resolves every provider name with no exact entry, so an `anthropic/…` string silently reaches OpenAI. Point it at a gateway or scripted test provider, something that accepts arbitrary model names.
- **Do not add `@pikku/ai-voice` as a dependency.** It still publishes but its source is `export {}`. Voice is two middlewares in `@pikku/core/agent`, with speech models reached through the `agentRunner`.
