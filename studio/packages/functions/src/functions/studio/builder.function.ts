import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'


export const BuilderStateInput = z.object({ key: z.string() })

export const builderState = pikkuSessionlessFunc({
  description: "The builder's conversation for a project.",
  input: BuilderStateInput,
  func: async ({ studio }, { key }) => studio.builder.state(key),
})

export const BuilderPromptInput = z.object({ key: z.string(), message: z.string(), context: z.string().optional() })

export const builderPrompt = pikkuSessionlessFunc({
  description: 'Ask the builder to do something in a project.',
  input: BuilderPromptInput,
  func: async ({ studio }, { key, message, context }) => studio.builder.prompt(key, message, context),
})

export const BuilderCancelInput = z.object({ key: z.string() })

export const builderCancel = pikkuSessionlessFunc({
  description: 'Stop what the builder is doing.',
  input: BuilderCancelInput,
  func: async ({ studio }, { key }) => {
    studio.builder.cancel(key)
    return studio.builder.state(key)
  },
})

export const BuilderClearInput = z.object({ key: z.string() })

export const builderClear = pikkuSessionlessFunc({
  description: 'Start a new builder conversation.',
  input: BuilderClearInput,
  func: async ({ studio }, { key }) => {
    await studio.builder.clear(key)
    return studio.builder.state(key)
  },
})
