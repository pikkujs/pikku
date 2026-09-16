//~ name: ai-vision
//~ title: Analyze an image with a vision model (describe/caption/classify) — one-shot, via agentRunner
//~ when: The app must UNDERSTAND an image and answer about it in natural language — describe/caption it, classify it, moderate it, answer "is there a cat in this photo?". One-shot backend call, NOT a chat assistant (that is the ai-agent scaffold) and NOT image GENERATION. For pulling the TEXT out of a scan/receipt/PDF use the ai-ocr scaffold (a cheaper, purpose-built OCR model), not this. The image usually comes from the file-upload scaffold (upload → getFileViewUrl → pass that url here).
//~ deferUntil: entity-write
//~ lang: ts
// ===== FILE: packages/functions/src/functions/analyze-image.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
//~ The model is CONFIG, not a hardcoded literal — wire it once so it is swappable per
//~ stage without touching this function. defineVariable/defineSecret come straight from
//~ @pikku/core (see the wire-config scaffold); keep this in its OWN *.config.ts file.
import { defineVariable } from '@pikku/core/variable'

//~ Un-pinned model: pick the vision model via a variable, with a vision-capable default.
//~ The value MUST be provider-prefixed AND a model your LiteLLM proxy actually routes
//~ WITH vision. On Fabric's default proxy that is `openai/gpt-5.6-luna` (cheap), `openai/gemini-pro-latest`,
//~ or `anthropic/claude-opus-4-8` — a text-only route (e.g. a deepseek chat model) rejects
//~ the image. Change the default per app; never assume a specific model exists.
defineVariable({
  name: 'AI_VISION_MODEL',
  displayName: 'Vision model',
  description: 'Provider-prefixed, vision-capable model id used for image analysis.',
  variableId: 'AI_VISION_MODEL',
  schema: z.string().default('openai/gpt-5.6-luna'),
})

export const AnalyzeImageInput = z.object({
  //~ A viewable image URL — pass the one getFileViewUrl returns (see the file-upload
  //~ scaffold), or any public https image URL.
  imageUrl: z.string().url(),
  //~ What to ask about the image. Keep the caller in control of the question.
  question: z.string().min(1).default('Describe this image in one or two sentences.'),
})
export const AnalyzeImageOutput = z.object({
  answer: z.string(),
})

//~ Destructuring `agentRunner` (the same VercelAgentRunner that powers pikkuAgent)
//~ is what tags this unit with the `ai-model` capability so the AI SDK stays bundled —
//~ a plain function that never touches it gets the SDK stubbed at build time. It is an
//~ OPTIONAL core service, so guard it. No API key to set up — Fabric injects AI creds.
export const analyzeImage = pikkuFunc({
  expose: true,
  auth: true,
  readonly: true, //~ pure read — looks at an image, writes nothing
  description: 'Ask a vision model a free-form question about an image.',
  input: AnalyzeImageInput,
  output: AnalyzeImageOutput,
  func: async ({ agentRunner, variables }, input) => {
    if (!agentRunner) {
      //~ Only fires if the AI credentials were not injected (LITELLM_PROXY_URL /
      //~ LITELLM_API_KEY missing). Surface it — never swallow the error.
      throw new Error('agentRunner not configured — AI is unavailable in this stage')
    }
    const model = await variables.get('AI_VISION_MODEL')
    //~ One non-streaming completion. The image rides in the message `content` array as
    //~ an `image` part (url OR `{ data: '<base64>', mediaType }`). tools:[] +
    //~ toolChoice:'none' + maxSteps:1 = "just answer, don't call tools".
    const { text } = await agentRunner.run({
      model,
      instructions:
        'You are a precise visual analyst. Answer only from what is visible in the image.',
      messages: [
        {
          id: crypto.randomUUID(), //~ works in the sandbox (bun/node) AND a deployed CF Worker
          role: 'user',
          content: [
            { type: 'text', text: input.question },
            { type: 'image', url: input.imageUrl }, //~ the vision part
          ],
          createdAt: new Date(),
        },
      ],
      tools: [],
      maxSteps: 1,
      toolChoice: 'none',
    })
    return { answer: text }
  },
})

//~ Need STRUCTURED analysis instead of prose (e.g. { hasReceipt: boolean, itemCount: number })?
//~ Pass an `outputSchema` (a JSON Schema) to agentRunner.run and type output to a matching
//~ z.object; run() fills `object` when tools is empty.
//~
//~ OCR (pulling verbatim text out of a scan/receipt/PDF) is a DIFFERENT job — a vision
//~ prompt can do it in a pinch, but a purpose-built OCR model is cheaper and far more
//~ accurate on dense documents. That belongs in a PROVIDER ADDON: `bun add @pikku/addon-mistral`,
//~ `wireAddon({ name: 'mistral', package: '@pikku/addon-mistral' })`, then call it as an RPC —
//~ `rpc.invoke('mistral:ocrProcess', { document: { type: 'document_url', documentUrl } })` for
//~ plain text, or `mistral:ocrExtract` to OCR + pull structured fields against a JSON Schema in
//~ one call. Same shape as @pikku/addon-whatsapp. Reach for that addon rather than forcing OCR
//~ through this vision call. (The addon also exposes `mistral:textEmbedding` and
//~ `mistral:audioTranscribe`, but do NOT reach for that one for audio: transcription
//~ already works through the proxy with no addon and no key — see the ai-transcribe
//~ scaffold.)

//~ ═══ CLIENT SIDE — analyze an uploaded image ═══
//~ First upload the file (file-upload scaffold: requestFileUpload → PUT bytes →
//~ getFileViewUrl), then feed the returned url here. usePikkuMutation with
//~ isPending/error for the button + INLINE feedback — never a toast, never useState:
//~
//~   const analyze = usePikkuMutation('analyzeImage')
//~   // <Button loading={analyze.isPending} onClick={() => analyze.mutate({ imageUrl, question })}>
//~   // {analyze.error && <Text c="red">{asI18n(analyze.error.message)}</Text>}
//~   // {analyze.data && <Text>{analyze.data.answer}</Text>}
