//~ name: ai-image
//~ title: Generate an image from a text prompt (text → image) — via agentRunner.generateImage, NEEDS an image model wired
//~ when: The app must CREATE an image from a description — generate an avatar, illustration, product mockup, thumbnail, or marketing visual from a prompt. NOT for understanding an existing image (that is ai-vision) and NOT for editing text (that is a normal agent). One-shot backend call that returns image bytes.
//~ deferUntil: entity-write
//~ lang: ts
//~ steps:
//~ ═══ CLIENT SIDE — generate + preview ═══
//~ usePikkuMutation with isPending/error for the button + INLINE feedback — never a toast:
//~
//~   const gen = usePikkuMutation('generateImage')
//~   // <Button loading={gen.isPending} onClick={() => gen.mutate({ prompt })}>
//~   // {gen.error && <Text c="red">{asI18n(gen.error.message)}</Text>}
//~   // {gen.data && <Image src={gen.data.dataUrl} />}
// ===== FILE: packages/functions/src/functions/generate-image.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { defineVariable } from '@pikku/core/variable'

//~ ⚠️ READ THIS BEFORE COPYING — image generation is NOT free like vision/extract.
//~ Text→image needs a DEDICATED image model, and `generateImage` is an OPTIONAL method
//~ on the AI runner. Fabric's DEFAULT LiteLLM proxy routes CHAT models only (no image
//~ route), and every provider prefix resolves to that same proxy — so on a
//~ stock sandbox `agentRunner.generateImage` THROWS. To enable it you must (a) route
//~ an image model in your LiteLLM config (e.g. an `gpt-image-1` / `dall-e-3` model_name)
//~ AND (b) register that provider with an image-model factory on the runner, OR wire a
//~ provider addon that exposes image generation. That is the "which addon did you choose"
//~ decision — call it out to the user; do not silently assume it is available.

//~ Un-pinned model id of an image model routed in the proxy. Change to whatever
//~ model_name you actually registered.
defineVariable({
  name: 'AI_IMAGE_MODEL',
  displayName: 'Image model',
  description: 'Provider-prefixed image-generation model id (e.g. openai/gpt-image-1).',
  variableId: 'AI_IMAGE_MODEL',
  schema: z.string().default('openai/gpt-image-1'),
})

export const GenerateImageInput = z.object({
  prompt: z.string().min(1).describe('What to draw.'),
  //~ Common aspect ratios; the model maps these to a supported size. Optional.
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
})
export const GenerateImageOutput = z.object({
  //~ The image as a data URL (`data:<mediaType>;base64,<...>`) so the client can render
  //~ it directly. For anything you keep, PERSIST it instead: upload the bytes via the
  //~ file-upload scaffold and return the stored URL — do not stuff large images through
  //~ every response. This inline form is for preview/one-off use.
  dataUrl: z.string(),
  mediaType: z.string(),
})

//~ Destructuring `agentRunner` tags this unit with the `ai-model` capability (keeps
//~ the AI SDK bundled) and gives us generateImage. It is optional — guard it.
export const generateImage = pikkuFunc({
  expose: true,
  auth: true,
  readonly: true, //~ pure generation — returns an image, writes nothing itself
  description: 'Generate an image from a text prompt.',
  input: GenerateImageInput,
  output: GenerateImageOutput,
  func: async ({ agentRunner, variables }, input) => {
    if (!agentRunner) {
      throw new Error('agentRunner not configured — AI is unavailable in this stage')
    }
    if (!agentRunner.generateImage) {
      //~ THE addon-dependent path (see the warning at top). Fail loud and actionable.
      throw new Error(
        'Image generation is not enabled: the AI runner has no image model. Route an ' +
          'image model (e.g. gpt-image-1) in your LiteLLM config and register it in ' +
          'the runner, or wire a provider addon that generates images.',
      )
    }
    const model = await variables.get('AI_IMAGE_MODEL')
    const { images } = await agentRunner.generateImage({
      model,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      n: 1,
    })
    const image = images[0]
    if (!image) {
      throw new Error('image model returned no image')
    }
    return {
      dataUrl: `data:${image.mediaType};base64,${image.base64}`,
      mediaType: image.mediaType,
    }
  },
})
