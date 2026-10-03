import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'


export const PublishOptionsInput = z.object({ key: z.string() })

export const publishOptions = pikkuSessionlessFunc({
  description: 'Where a project can be published, and the prompts for each.',
  input: PublishOptionsInput,
  func: async ({ studio }, { key }) => studio.publisher.options(key),
})

export const PublishToFabricInput = z.object({ key: z.string() })

export const publishToFabric = pikkuSessionlessFunc({
  description: 'Publish a project to Fabric.',
  input: PublishToFabricInput,
  func: async ({ studio }, { key }) => studio.publisher.fabric(key),
})

export const PublishStatusInput = z.object({ key: z.string() })

export const publishStatus = pikkuSessionlessFunc({
  description: "How a project's publish is going.",
  input: PublishStatusInput,
  func: async ({ studio }, { key }) => studio.publisher.status(key),
})
