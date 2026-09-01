---
name: pikku-agent
description: >-
  Use when building AI agents, chatbots or LLM-powered assistants with Pikku — pikkuAgent, ref()
  tool registration, memory, streaming, tool approval, thread ownership, invocation via rpc.agent,
  the VercelAgentRunner and its provider map, and the voiceInput/voiceOutput middlewares. TRIGGER
  when: code uses pikkuAgent/rpc.agent/runAgent/streamAgent/VercelAgentRunner/voiceInput, user asks
  about AI agents, chatbots, tool-calling, agent memory or streaming, model providers, speech in or
  out, or `pikku enable agent`. DO NOT TRIGGER when: user asks about MCP tool exposure (use
  pikku-wiring), workflows (use pikku-workflow), or general function definitions (use
  pikku-concepts).
installGroups: [core]
---

# Pikku AI Agents

Signatures and option keys come from `pikku doc` — run `pikku doc --ai` for the
installed surface. This skill is the part the compiler cannot tell you: how an
agent reaches the rest of the app, and which of its knobs mean something other
than what they look like.

## Pick the reference

| You are… | Read |
| --- | --- |
| Defining or invoking an agent — tools, memory, streaming, approval, threads | `references/agents.md` |
| Wiring the runner, or pointing model strings at a provider or gateway | `references/runner-vercel.md` |
| Adding speech in or out of an agent | `references/voice.md` |

## An agent is a function that reaches other functions

Tools, sub-agents and workflows are all supplied as `ref('domain:funcName')`
handles rather than imported values. The inspector resolves each ref against the
generated function map, which is what lets an agent call into another package or
a `graph:*` builtin without an import cycle — and what lets the tool menu be
filtered per session before the model ever sees it.

Invoke through `wire.rpc.agent` from inside a Pikku function; it carries the
session, the credentials and the RPC depth for you.

## The knobs that do not mean what they look like

- **`goal` is the prompt field, and it is required.** There is no `instructions`
  key. `role`, `personality` and `goal` are concatenated in that order and
  nothing validates which text lands where, so the split buys legibility only.
- **`output` is honoured only when the agent has no tools.** A structured-output
  schema on a tool-calling agent is silently inert.
- **`auth` defaults to `false`**, because agents are normally invoked from an
  already-authenticated `pikkuFunc`. `scopes` and `permissions` are enforced
  either way — see `pikku-auth`.
- **`approvalRequired` sits on the tool function, not on the agent.** The run
  then resolves `status: 'suspended'` with `pendingApprovals`; answer with
  `rpc.agent.approve(runId, approvals)`.
- **Model strings split on the first slash only** — `provider/model`, so
  `'ollama/qwen2.5:7b'` is fine and a string with no slash throws rather than
  defaulting to a provider.

## What NOT to do

- **Do not trust a caller-supplied `resourceId` as an owner.** It never is: the
  session's principal (`userId`, or `orgId` under `sessionScope: 'org'`) is
  prefixed onto it, so a client sub-partitions inside its own boundary and cannot
  read across one. A sessionless run gets an ephemeral anonymous owner.
- **Do not rely on the tool menu alone for authorization.** It is two-layer — the
  session decides which tools an agent can see, and the function's own
  `permissions` still guard the call when the model picks one.
- **Do not point the `'*'` provider at a single vendor.** It resolves every
  provider name with no exact entry, so aimed at one vendor an `anthropic/…`
  string silently reaches OpenAI. Point it at a gateway or a scripted test
  provider — something that genuinely accepts arbitrary model names.
- **Do not add `@pikku/ai-voice` as a dependency.** It still publishes but its
  entire source is `export {}`. Voice is two middlewares in `@pikku/core/agent`,
  with the speech models reached through the `agentRunner`.
