# Integration stub → Pikku addon

Translate n8n integration nodes (`gmailTool`, `slackTool`, `googleSheetsTool`, plain
`gmail` / `slack` action nodes, etc.) that the importer left as throwing stubs into
real `ref('<addonRpc>')` references pointing at functions in **installed**
`@pikku/addon-*` packages.

This is **per-stub mechanical**. Do not invent business logic, chain calls, or
"improve" the workflow. Read one manifest entry, find the matching addon function,
rewrite the stub.

## Inputs

1. **Manifest** — `<workflow>.integrations.json` next to the `.graph.ts`. Each entry:
   ```jsonc
   {
     "rpcName": "agentGmailtool__sendAMessageInGmail",
     "n8nType": "n8n-nodes-base.gmailTool",
     "n8nName": "Send a message in Gmail",
     "parameters": { "sendTo": "...", "message": "...", "subject": "..." },
     "credentials": { "gmailOAuth2": { "id": "...", "name": "Personal Gmail" } },
     "isAgentTool": true,
     "agentName": "Inbox Assistant"
   }
   ```
2. **Installed addons** — `@pikku/addon-*` in the project's `package.json`
   `dependencies`. Map **only** against installed packages. If the addon for an n8n
   type is not installed, surface it (see SKILL step 4) — never silently skip and
   never pick a vaguely-named function from another addon.

## Per entry, in order

### Step 1 — identify the target addon

Map `n8nType` to a package by reading its source. Common shapes (**guesses, not
authoritative** — always verify against installed source):

| n8n type prefix | typical addon candidate |
|---|---|
| `n8n-nodes-base.gmail` / `gmailTool` | `@pikku/addon-email-gmail` |
| `n8n-nodes-base.slack` / `slackTool` | `@pikku/addon-chat-slack` |
| `n8n-nodes-base.googleSheets` / `…Tool` | `@pikku/addon-sheets-google` |
| `n8n-nodes-base.notion` / `notionTool` | `@pikku/addon-docs-notion` |
| `n8n-nodes-base.telegram` / `telegramTool` | `@pikku/addon-chat-telegram` |

If no installed addon plausibly covers the n8n type, stop and report it — do not
pick a wrong addon.

### Step 2 — pick the function (resource + operation → fn name)

n8n nodes use a `(resource, operation)` pair. Rubric:

- `resource` defaults to the integration's primary noun if absent (gmail →
  `message`, slack → `message`, sheets → `spreadsheet`). Read the addon's folder
  structure (`messages/`, `drafts/`, `channels/`) to see what nouns exist.
- `operation` is usually a verb (`get`, `getAll`, `send`, `delete`, `addLabels`).
- The pikku function name is almost always `<resource><Verb>` in camelCase, matching
  the file's `export const` (`messageList` for `messages/list.function.ts`).

Verify: `grep -h "^export const" <addonPkg>/src/functions/**/*.ts` and match by name.
Conventions in `@pikku/addon-email-gmail` (a **sanity reference**, not a fallback):

- `getAll → <resource>List`, `get → <resource>Get`, `send → <resource>Send`,
  `delete → <resource>Delete`, `reply → <resource>Reply`
- `addLabels → <resource>AddLabel` (singular!), `removeLabels → <resource>RemoveLabel`
- `markAsRead / markAsUnread → <resource>MarkRead / <resource>MarkUnread`
- `create → <resource>Create`

If the function has a `node:` block, prefer matching its `category`/`displayName`
over guessing.

### Step 3 — rewrite the stub

Two outcomes, by `isAgentTool`:

**A) `isAgentTool: true`** — the stub is an agent tool referenced via `ref()`:
1. Delete the stub file.
2. In the agent file, replace `ref('agentGmailtool__sendAMessageInGmail')` in
   `tools: [...]` with `ref('messageSend')` (the resolved addon function).
3. Ensure the addon is where pikku scans functions (usually automatic via
   `node_modules/@pikku/addon-*`).

If you can't delete safely, leave a one-line re-export instead of a stub:
```ts
import { messageSend } from '@pikku/addon-email-gmail'
export const agentGmailtool__sendAMessageInGmail = messageSend
```
Default is delete + retarget; wrappers add maintenance burden.

**B) `isAgentTool: false`** — the stub is a graph node:
1. Open `<workflow>.graph.ts`.
2. In `nodes: { … }` find the entry whose value is the stub rpc name.
3. Replace it with the addon function name (`'messageSend'`).
4. If `config: { <id>: { input } }` produces an `{ items }` envelope, rewrite it to
   the addon function's real input schema (read its `input: z.object({...})`).
5. Delete the stub file.

### Step 4 — port hard-coded parameters

- **Hardcoded values** (`"limit": 20`, `"labelIds": ["INBOX"]`) were user choices.
  Preserve them in the graph node's `input` (case B). **Agent tools cannot carry
  hardcoded params** (the LLM fills args at call time) — surface the trade-off; if
  the user needs a value pinned, they keep a thin wrapper.
- **`$fromAI('Name', '', 'string')`** placeholders are LLM-filled — the addon's Zod
  schema becomes the tool schema. Just drop the placeholder string; no other action.

### Step 5 — credentials

`credentials: { gmailOAuth2: { id, name } }` is the n8n credential ref. Pikku addons
expect a wired service (`services.gmail`). Do **not** auto-wire — leave a TODO:

> `// TODO: wire services.gmail using credential "Personal Gmail" (n8n id: gmail_cred_1) — see @pikku/addon-email-gmail/README.md`

## Never

- Invent functions that don't exist — grep first.
- Pick a wrong addon because the right one isn't installed — report `npm i @pikku/addon-<x>`.
- Bake per-mapping tables into `@pikku/n8n-import` — it is addon-agnostic; mapping lives here.
- Modify the manifest — it's an audit artifact.
- Chain calls — each entry maps to exactly one addon function.
- Silently drop a hardcoded param — surface it.
