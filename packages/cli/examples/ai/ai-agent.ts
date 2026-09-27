//~ name: ai-agent
//~ title: AI agent (pikkuAgent + tool) — auto-served at /rpc/agent/<name>
//~ when: The app needs an in-app AI assistant/chat. Pass the ASSISTANT's name as the entity (`--entity kitchen-assistant`) — it writes the agent and one example tool as separate files with the export name, the `name:` field and the filename all in agreement, which is the thing that otherwise 500s with "AI agent not found": the route is /rpc/agent/<exported const name>, and the frontend PikkuAgentChat `agentName` must equal that same identifier. Defining the agent is ENOUGH — pikku auto-exposes /rpc/agent/<name> (non-streaming) and /rpc/agent/<name>/stream (SSE). Do NOT wireHTTP it, do NOT hand-roll a /chat route. For a ONE-SHOT AI call that is NOT a chat use the dedicated scaffolds instead: ai-extract (text → typed fields), ai-vision (understand an image), ai-transcribe (audio → text), ai-image (text → image), ai-speech (text → audio). If a tool the agent calls has real-world consequences (sends/charges/deletes), gate it for human approval — see ai-approval-tool.
//~ deferUntil: entity-write
//~ lang: ts
//~ entity: assistant
//~ steps:
//~ THE TOOL. A TOOL is just a normal pikkuFunc the agent is allowed to call. Each tool
//~ goes in its OWN *.function.ts (one func per file) and the agent in its own
//~ *.agent.ts; import the tool into the agent file WITH the .js extension
//~ (`import { suggestPriority } from '../functions/suggest-priority.function.js'`) and
//~ pass the imported reference to `tools: [...]`. A tool needs `expose: true` (it is
//~ also a real RPC) and, like every function, its I/O types come ONLY from the zod
//~ schemas.
//~
//~ ⚠️ EVERY name in `tools: [...]` MUST have a matching `import` at the TOP of the AGENT
//~ file — this is the #1 agent-wiring loop. The natural move is to REUSE an existing
//~ CRUD function as a tool (e.g. "the assistant can list animals" → your
//~ `listAnimals`), but a bare identifier with no import fails codegen with
//~ `[PKU124] AI agent '<name>' tools array contains identifier 'listAnimals' that
//~ could not be resolved to a pikkuFunc`. The fix is ALWAYS to add the import
//~ (`import { listAnimals } from '../functions/list-animals.function.js'`), never to
//~ drop or rename the tool. If PKU124 lists 5 tools, you are missing 5 imports — add
//~ them ALL in one edit, then `pikku all` ONCE (do not re-verify per import).
//~ A reused CRUD func also needs `expose: true` on its own declaration to be callable.
//~
//~ The tool does its work DIRECTLY in `func` via the injected services (kysely, …)
//~ scoped to session.userId — read/write the DB there. The agent decides WHEN to call
//~ it; you decide WHAT it does, so swap the shipped heuristic for whatever the domain
//~ needs (a query, a write, an external call). Do NOT proxy to another function
//~ through `rpc` / `rpc.exposed()` — there is no such API in a tool; if a tool shares
//~ logic with a CRUD function, extract a lib helper both call.
//~
//~ THE AGENT. Listing it is all you need — pikku generates the HTTP routes.
//~ ⚠️ CRITICAL — THE AGENT'S ADDRESS IS ITS EXPORTED CONST NAME, NOT `name`. pikku
//~ registers `addAIAgent('<exportedConstName>', ...)` and serves the routes off that
//~ SAME identifier:
//~   POST /rpc/agent/<exportedConstName>         (non-streaming)
//~   POST /rpc/agent/<exportedConstName>/stream  (SSE — what the chat UI uses)
//~ The `name` field is human-facing metadata ONLY — it is NOT the URL segment and NOT
//~ what the frontend calls. To avoid the "AI agent not found" 500, keep the exported
//~ const name and `name` IDENTICAL (one camelCase identifier for both), and the
//~ frontend PikkuAgentChat `agentName` MUST equal that exported const name. As
//~ written the export is `assistant` and `name: 'assistant'` — if you rename it for
//~ your domain (e.g. `todoAssistant`), set `name: 'todoAssistant'` too and pass
//~ `agentName="todoAssistant"` in the chat page. NEVER a kebab-case `name` that
//~ differs from the export — that is exactly what breaks the assistant.
//~
//~ `model` MUST be provider-prefixed — Fabric routes everything through one LiteLLM
//~ proxy, so use `openai/gpt-5.6-luna` (a bare alias fails). No API key to set up:
//~ Fabric injects the AI credentials for the sandbox automatically.
//~ `goal` is the system prompt. `tools` is the list of pikkuFuncs it may call — add
//~ EVERY tool the assistant should be able to call, each with its import.

// ===== FILE: packages/functions/src/functions/suggest-priority.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const SuggestPriorityInput = z.object({
  title: z.string(),
  notes: z.string().optional(),
})
export const SuggestPriorityOutput = z.object({
  priority: z.enum(['low', 'medium', 'high']),
  reason: z.string(),
})

export const suggestPriority = pikkuFunc({
  expose: true,
  auth: true,
  description: 'Suggest a priority for a task from its title/notes.',
  input: SuggestPriorityInput,
  output: SuggestPriorityOutput,
  func: async ({ kysely }, input, { session }) => {
    void kysely
    void session
    const urgent = /urgent|asap|today|critical|overdue/i.test(`${input.title} ${input.notes ?? ''}`)
    return {
      priority: urgent ? 'high' : 'medium',
      reason: urgent ? 'Time-sensitive wording.' : 'No urgency signals detected.',
    }
  },
})

// ===== FILE: packages/functions/src/agents/assistant.agent.ts =====
import { pikkuAgent } from '#pikku/agent'
import { suggestPriority } from '../functions/suggest-priority.function.js'

export const assistant = pikkuAgent({
  name: 'assistant',
  description: 'In-app AI helper for this app’s domain.',
  goal: [
    'You are the AI helper built into this app. Be concise and helpful.',
    'Use the tools you are given to act on real data instead of guessing.',
    'When the user asks for something a tool can do, call the tool — do not just describe it.',
  ].join('\n'),
  model: 'openai/gpt-5.6-luna',
  tools: [suggestPriority],
  maxSteps: 6,
})
