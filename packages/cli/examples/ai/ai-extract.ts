//~ name: ai-extract
//~ title: Extract STRUCTURED data from free text (parse/classify/tag → typed JSON) — a one-shot declared agent
//~ when: The app has UNSTRUCTURED text and needs TYPED FIELDS out of it — parse a pasted email/message into { sender, intent, dueDate }, classify a support ticket into a category + urgency, pull action items out of a meeting note, tag/score/summarize any blob into a fixed shape. A DECLARED one-shot agent (no tools, one step) called from a normal RPC, NOT a chat assistant (ai-agent) and NOT prose. For text off an IMAGE use ai-vision; for a scan/PDF use @pikku/addon-mistral ocrProcess then feed the text here.
//~ deferUntil: entity-write
//~ lang: ts

//~ steps:
//~ ═══ CLIENT SIDE — parse a pasted message ═══
//~ usePikkuMutation with isPending/error for the button + INLINE feedback — never a toast,
//~ never useState for loading/error:
//~
//~   const extract = usePikkuMutation('extractFields')
//~   // <Button loading={extract.isPending} onClick={() => extract.mutate({ text })}>
//~   // {extract.error && <Text c="red">{asI18n(extract.error.message)}</Text>}
//~   // {extract.data && <Badge>{extract.data.category}</Badge>}  // typed — category/urgency/…
// ===== FILE: packages/functions/src/agents/field-extractor.agent.ts =====
import { z } from 'zod'
import { pikkuAgent } from '#pikku/agent'

//~ THE shape you want out. This ONE z.object is the single source of truth: it is the
//~ agent's `output`, so the runner constrains the model to it AND `rpc.agent.run` comes
//~ back typed as it — no second hand-written JSON Schema to drift. Make fields specific:
//~ enums for categories, describe() to steer the model, .nullable() for "might be absent"
//~ so the model returns null instead of hallucinating. Swap these for your domain.
export const ExtractedFields = z.object({
  category: z
    .enum(['bug', 'billing', 'feature-request', 'question', 'other'])
    .describe('The single best category for this message.'),
  urgency: z.enum(['low', 'medium', 'high']).describe('How time-sensitive it is.'),
  summary: z.string().describe('A one-sentence neutral summary.'),
  actionItems: z.array(z.string()).describe('Concrete follow-up actions, empty if none.'),
  dueDate: z.string().nullable().describe('ISO date if the text names a deadline, else null.'),
})

//~ EVERY text-generating AI call in the app is a DECLARED agent — including a one-shot
//~ like this one, which is why there is no `agentRunner.run(...)` anywhere here. Not
//~ style: declaring it registers the agent in pikku's generated meta, so the call gets a
//~ thread and a recorded run row, and it shows up in the app's agent view with its
//~ inputs, outputs and token usage. An inline runner call is invisible to all of that.
//~
//~ ONE-SHOT = `tools: []` + `maxSteps: 1` + `toolChoice: 'none'` + an `output` schema.
//~ That is the whole difference from the chat assistant in the ai-agent scaffold: it
//~ answers once, in your shape, and never calls a tool.
//~
//~ CRITICAL — THE AGENT'S ADDRESS IS ITS EXPORTED CONST NAME, NOT `name`. pikku registers
//~ `addAIAgent('<exportedConstName>', ...)`, and that is the string you pass to
//~ `rpc.agent.run(...)`. Keep the exported const and `name` IDENTICAL (one camelCase
//~ identifier for both) or the call 500s with "AI agent not found".
//~
//~ `model` MUST be provider-prefixed — Fabric routes everything through one LiteLLM proxy,
//~ so `openai/gpt-5.6-luna` (cheap, fine for extraction), `openai/gemini-pro-latest` or
//~ `anthropic/claude-opus-4-8`; a bare alias fails. ⚠️ A reasoning model like `deepseek/*`
//~ may REJECT JSON-schema structured output through the proxy — stay on an OpenAI/Anthropic
//~ route whenever you declare an `output`. No API key to set up: Fabric injects the AI
//~ credentials. This declaration is the ONE place the model is named — do not add a
//~ defineVariable for it and do not pass a `model` at the call site: the generated type
//~ for `rpc.agent.run` accepts only `{ message, threadId, resourceId }`.
export const fieldExtractor = pikkuAgent({
  name: 'fieldExtractor', //~ <-- keep IDENTICAL to the exported const name above
  description: 'Extracts structured, typed fields from a blob of free text.',
  goal: [
    'You extract structured fields from the text the user sends.',
    'Use only what the text supports — never invent a value.',
    'When the text does not name something, return null or an empty list for it.',
  ].join('\n'),
  model: 'openai/gpt-5.6-luna',
  output: ExtractedFields, //~ makes the run return a validated object instead of prose
  tools: [], //~ one-shot: nothing to call
  maxSteps: 1,
  toolChoice: 'none',
})

// ===== FILE: packages/functions/src/functions/extract-fields.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
//~ The agent file owns the schema; import it rather than restating the shape. The `.js`
//~ extension is required on the import, same as for agent tools.
import { ExtractedFields } from '../agents/field-extractor.agent.js'

export const ExtractInput = z.object({
  //~ The raw text to parse. Keep the caller in control of what goes in.
  text: z.string().min(1),
})
//~ Output IS the extracted shape — the function returns exactly ExtractedFields.
export const ExtractOutput = ExtractedFields

//~ A thin RPC over the agent, so the frontend calls one typed function instead of the
//~ agent route directly — and so the extraction can be called from a create/update
//~ function later without going through HTTP. `rpc` is on the THIRD parameter, never on
//~ services. There is no `agentRunner` here and no optional-service guard to write:
//~ the agent runner is the platform's problem, not this function's.
export const extractFields = pikkuFunc({
  expose: true,
  auth: true,
  readonly: true, //~ pure read — parses text, writes nothing
  description: 'Extract structured, typed fields from a blob of free text.',
  input: ExtractInput,
  output: ExtractOutput,
  func: async (_services, input, { rpc, session }) => {
    //~ Every run belongs to a thread. A one-shot has no conversation to continue, so mint
    //~ a fresh thread per call — the runner creates it — and scope it to the user with
    //~ resourceId, which is what files the run under them in the agent view.
    //~ crypto.randomUUID() works in the sandbox (bun/node) AND a deployed CF Worker.
    //~ `result` is typed as ExtractedFields because the agent declared it as its output.
    const { result } = await rpc.agent.run('fieldExtractor', {
      message: input.text,
      threadId: crypto.randomUUID(),
      resourceId: session.userId,
    })
    //~ Parse the result back through the SAME schema so a malformed model response fails
    //~ loudly here (typed) rather than downstream.
    return ExtractedFields.parse(result)
  },
})
