---
type: decision
title: Console functions are each gated by one declared pikku:console scope, with no role check in the body
description: Most console functions declare exactly one pikku:console:* scope in scopes and check no role in the body; ping and get-agent-run-scores declare no scopes at all
tags: console, scopes, auth
---

# Console functions are each gated by one declared pikku:console scope, with no role check in the body

Each console function below sets `expose: true` and a `scopes` array holding one
`pikku:console:<area>:<verb>` entry. The function body then does no role check of
its own; the declared scope is the access rule the function states. The scope
entry is cited by line.

- `add-i18n-locale.function.ts:13` — `pikku:console:i18n:write`
- `create-theme.function.ts:8` — `pikku:console:design:write`
- `generate-favicon.function.ts:14` — `pikku:console:design:write`
- `get-component-meta.function.ts:13` — `pikku:console:design:read`
- `get-git-diff.function.ts:14` — `pikku:console:git:read`
- `get-jsx-props.function.ts:13` — `pikku:console:design:read`
- `get-pages.function.ts:13` — `pikku:console:pages:read`
- `get-theme-spec.function.ts:9` — `pikku:console:design:read`
- `get-workflow-run-history.function.ts:8` — `pikku:console:workflows:read`
- `list-webhook-deliveries.function.ts:22` — `pikku:console:wirings:read`
- `read-function-body.function.ts:12` — `pikku:console:wirings:read`
- `screenshot-pages.function.ts:16` — `pikku:console:pages:screenshot`
- `update-agent-config.function.ts:17` — `pikku:console:agents:manage`
- `update-theme-spec.function.ts:10` — `pikku:console:design:write`
- `complete-studio-change.function.ts:12` — `pikku:console:changes:write`
- `delete-workflow-run.function.ts:11` — `pikku:console:workflows:manage`
- `get-addon-meta.function.ts:12` — `pikku:console:addons:read`
- `get-all-meta.function.ts:11` — `pikku:console:wirings:read`
- `get-file-diagnostics.function.ts:14` — `pikku:console:files:read`
- `get-installed-addons.function.ts:36` — `pikku:console:addons:read`
- `get-openapi-detail.function.ts:26` — `pikku:console:addons:read`
- `get-surface.function.ts:10` — `pikku:console:wirings:read`
- `get-webhook-delivery.function.ts:12` — `pikku:console:wirings:read`
- `get-workflow-runs.function.ts:18` — `pikku:console:workflows:read`
- `list-studio-changes.function.ts:17` — `pikku:console:changes:read`
- `push-git-changes.function.ts:11` — `pikku:console:git:sync`
- `react-to-studio-wish.function.ts:11` — `pikku:console:wishes:write`
- `reply-to-studio-change.function.ts:11` — `pikku:console:changes:write`
- `stream-meta-changes.function.ts:9` — `pikku:console:wirings:read`
- `update-function-config.function.ts:17` — `pikku:console:code:write`

Two functions in this folder declare no `scopes` key and are gated inside the
body instead: `ping.function.ts:21-25` and `get-agent-run-scores.function.ts:8-13`.
They have their own notes, linked from the decisions index.

**What this rules out:** a console function whose access comes from a role name
written into its body rather than from its declared `scopes` entry. None of the
functions listed above does that.
