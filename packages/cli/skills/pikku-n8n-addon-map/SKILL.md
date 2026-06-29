---
name: pikku-n8n-addon-map
description: 'Use when mapping n8n integration stubs (gmailTool, slackTool, googleSheetsTool, plain gmail/slack action nodes, etc.) emitted by @pikku/n8n-import to real `@pikku/addon-*` functions. Triggered when the user points at a `<workflow>.integrations.json` manifest produced by `pikku-n8n-import`, says ''map the n8n integrations'', ''wire up the gmail/slack stubs'', ''replace these stubs with addon refs'', or opens a stub file generated from an n8n integration node (the stub''s JSDoc says `STUB — generated from n8n node "..." (type "n8n-nodes-base.<service>...")`). For n8n **Code** node stubs use `pikku-n8n-code-translate` instead.'
metadata:
  version: 1.0.0
---

# n8n Integration Stub → Pikku Addon Mapper

## Agent Operating Procedure

Use this skill as an execution checklist, not reference material.

1. Discover before editing. Prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command and inspect only the focused output you need.
2. Identify the source files that own the behavior. Do not start by reading generated output, `.pikku`, `node_modules`, vendored packages, or broad build artifacts.
3. Make the smallest source change that satisfies the task. Keep generated files generated, and avoid hand-editing SDKs, schema output, or typegen.
4. Validate with the narrowest relevant command first, then run `pikku-verify` or `pikku all` when functions, wirings, schemas, or generated clients may have changed.
5. If validation fails, fix the source cause and rerun validation. Do not paper over generated errors by editing generated files.

You are translating n8n integration nodes (`gmailTool`, `slackTool`, `googleSheetsTool`, plain `gmail` / `slack` action nodes, etc.) that `@pikku/n8n-import` left as throwing stubs into real `ref('<addonRpc>')` references that point at functions in installed `@pikku/addon-*` packages.

This skill is **per-stub mechanical**. You do not invent business logic, you do not chain calls, you do not "improve" the workflow. You read one entry from a manifest, find the matching addon function, and rewrite the stub.

## Inputs

1. **Manifest file** — `<workflow>.integrations.json` next to the workflow `.graph.ts`. Each entry:
   ```jsonc
   {
     "rpcName": "agentGmailtool__sendAMessageInGmail",
     "n8nType": "n8n-nodes-base.gmailTool",
     "n8nName": "Send a message in Gmail",
     "parameters": { "sendTo": "...", "message": "...", "subject": "..." },
     "credentials": {
       "gmailOAuth2": { "id": "...", "name": "Personal Gmail" },
     },
     "isAgentTool": true,
     "agentName": "Inbox Assistant",
   }
   ```
2. **Installed addons** — anything matching `@pikku/addon-*` in the project's `package.json` `dependencies`. The mapping is _only_ allowed against installed packages. If the addon for a given n8n type is not installed, surface that — do not silently skip and do not pick a vaguely-named function from another addon.

## What you actually do, in order

For **each** entry in the manifest:

### Step 1 — identify the target addon

Map `n8nType` to a `@pikku/addon-*` package by reading its source. Common shapes:

| n8n type prefix                            | typical addon package candidate(s) |
| ------------------------------------------ | ---------------------------------- |
| `n8n-nodes-base.gmail` / `gmailTool`       | `@pikku/addon-email-gmail`         |
| `n8n-nodes-base.slack` / `slackTool`       | `@pikku/addon-chat-slack`          |
| `n8n-nodes-base.googleSheets` / `…Tool`    | `@pikku/addon-sheets-google`       |
| `n8n-nodes-base.notion` / `notionTool`     | `@pikku/addon-docs-notion`         |
| `n8n-nodes-base.telegram` / `telegramTool` | `@pikku/addon-chat-telegram`       |

**These are guesses, not authoritative.** Always verify by reading the installed addon's `src/functions/**` to confirm the exported function names exist. If you cannot find an installed addon that plausibly covers this n8n type, stop and tell the user — do not pick a wrong addon.

### Step 2 — pick the function (resource + operation → fn name)

n8n integration nodes use a `(resource, operation)` pair to disambiguate. The mapping rubric:

- `resource` defaults to the integration's primary noun if absent (gmail → `message`, slack → `message`, sheets → `spreadsheet`, etc.). Look at the addon's folder structure (`messages/`, `drafts/`, `channels/`) to see what nouns exist.
- `operation` is usually a verb (`get`, `getAll`, `send`, `delete`, `addLabels`, `markAsRead`, `create`).
- The pikku addon function name is almost always `<resource><Verb>` in camelCase, matching the file's `export const` (e.g. `messageList` for `messages/list.function.ts`, `draftCreate` for `drafts/create.function.ts`).

Verify by `grep -h "^export const" <addonPkg>/src/functions/**/*.ts` and matching by name.

Conventions seen in `@pikku/addon-email-gmail` (use as a sanity reference, **not** as a fallback if the addon is something else):

- `getAll` → `<resource>List`
- `get` → `<resource>Get`
- `send` → `<resource>Send`
- `delete` → `<resource>Delete`
- `reply` → `<resource>Reply`
- `addLabels` → `<resource>AddLabel` (singular!)
- `removeLabels` → `<resource>RemoveLabel`
- `markAsRead` / `markAsUnread` → `<resource>MarkRead` / `<resource>MarkUnread`
- `create` (drafts/labels) → `<resource>Create`

If the addon has a `node:` block on the function, prefer matching on that block's `category`/`displayName` over guessing — read the source.

### Step 3 — rewrite the stub

The stub file currently looks like:

```ts
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const AgentGmailtoolSendAMessageInGmailInput = z.object({
  items: z.array(z.unknown()).optional(),
})
export const AgentGmailtoolSendAMessageInGmailOutput = z.object({
  items: z.array(z.unknown()),
})

/** STUB — generated from n8n node "Send a message in Gmail" (type "n8n-nodes-base.gmailTool"). … */
export const agentGmailtool__sendAMessageInGmail = pikkuSessionlessFunc({
  func: async () => {
    throw new Error('agentGmailtool__sendAMessageInGmail — implement me')
  },
})
```

**There are two outcomes**, depending on `isAgentTool`:

#### A) `isAgentTool: true` — the stub is consumed by an agent via `ref()`

The agent file references the stub by its export name. The cleanest path is:

1. **Delete the stub file entirely.**
2. In the agent file (look in the same emitted directory or `src/functions`), update the agent's `tools: [...]` array — replace `ref('agentGmailtool__sendAMessageInGmail')` with `ref('messageSend')` (or whichever addon function name you resolved).
3. Make sure the addon package is imported wherever pikku scans functions (typically already handled by pikku CLI scanning `node_modules/@pikku/addon-*`).

If you cannot delete the stub safely (e.g. it has multiple consumers, or the user wants to keep a thin wrapper for renaming), leave a _one-line_ re-export wrapper instead:

```ts
import { messageSend } from '@pikku/addon-email-gmail'
export const agentGmailtool__sendAMessageInGmail = messageSend
```

But the default is delete + retarget. Wrappers add maintenance burden.

#### B) `isAgentTool: false` — the stub is part of the workflow graph proper

1. Open the workflow `.graph.ts` file.
2. Find the entry in `nodes: { … }` whose value is the stub's rpc name (e.g. `'agentGmailtool__sendAMessageInGmail'`).
3. Replace the value with the addon function name (e.g. `'messageSend'`).
4. If the workflow's `config: { <id>: { input: … } }` block has an `input` expression that produces an `{ items }` envelope, rewrite it to produce the addon's actual input schema (read the addon function's `input: z.object({...})` to know the shape).
5. Delete the stub file.

### Step 4 — port hard-coded parameters

n8n parameters fall into two camps:

- **Hardcoded values** (e.g. `"limit": 20`, `"labelIds": ["INBOX"]`, `"sendTo": "alice@example.com"`) — these were user choices in the n8n UI. Preserve them in the workflow's `input` expression (case B), or, for agent tools (case A), document them in the agent's tool list comment so the user knows what was lost. **Agent tools cannot carry hardcoded params** — the LLM fills the args at call time. If the user _needs_ a hardcoded value baked in, they must keep a wrapper function. Surface this trade-off explicitly.
- **`$fromAI('Name', '', 'string')` placeholders** — these are LLM-filled. They map naturally to addon function input fields the LLM will populate via the `pikkuAIAgent`'s tool-calling. No action needed beyond deleting the placeholder string; the addon's Zod schema becomes the tool schema.

### Step 5 — credentials

Each entry's `credentials: { gmailOAuth2: { id, name } }` is the n8n credential reference. Pikku addons typically expect a service (e.g. `services.gmail`) wired in `services.ts`. Do **not** attempt to auto-wire — append a one-line note for the user:

> `// TODO: wire services.gmail using credential "Personal Gmail" (n8n id: gmail_cred_1) — see @pikku/addon-email-gmail/README.md`

…either at the top of the workflow file or printed in your final summary.

## What you must NOT do

- **Do not invent functions** in addon packages that don't exist. Grep first.
- **Do not pick the wrong addon** because the right one isn't installed. Stop and tell the user `npm i @pikku/addon-<x>` is required.
- **Do not bake per-mapping tables into `@pikku/n8n-import`.** That package is intentionally addon-agnostic. All mapping logic lives here in this skill.
- **Do not modify the manifest file.** It's an audit artifact. Leave it alone.
- **Do not chain calls** ("send and then mark as read"). Each manifest entry maps to _one_ addon function. If the n8n graph composed multiple steps, the n8n-import already represented that as multiple stubs / multiple workflow nodes.
- **Do not silently drop hardcoded params.** If the addon function has no place to put a value, surface it in the summary.

## After you finish

Print a short summary to the user:

```
Mapped 3 of 5 stubs:
  ✓ agentGmailtool__sendAMessageInGmail → ref('messageSend')      [agent tool: Inbox Assistant]
  ✓ agentGmailtool__getManyMessagesInGmail → ref('messageList')   [agent tool: Inbox Assistant]
  ✓ workflow node 'updateRow' → 'sheetRowAppend'                  [graph node]

Unmapped:
  ✗ slackTool 'Post to channel'  — @pikku/addon-chat-slack not installed (npm i @pikku/addon-chat-slack)
  ✗ notionTool 'Create page'     — no `pageCreate` in @pikku/addon-docs-notion (only `pageGet`, `pageUpdate`)

Hardcoded params worth knowing:
  • Get many messages in Gmail had limit=20, labelIds=["INBOX"] — agent tools cannot pin these; if you need them fixed, add a thin wrapper function.

Credential wiring TODOs added to the top of agentGmailtool.graph.ts.
```

Be terse. The user already knows the workflow context — they pointed you at the manifest.
