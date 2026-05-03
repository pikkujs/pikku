import { pikkuSessionlessFunc } from '#pikku'
import type { JSONSchema7 } from 'json-schema'

export const getSchema = pikkuSessionlessFunc<
  { schemaName: string },
  JSONSchema7 | null
>({
  description:
    'Given a schemaName string, looks up and returns the corresponding JSONSchema7 definition from metaService.getSchema(). Returns null if the schema does not exist.',
  expose: true,
  auth: false,
  func: async ({ metaService }, input) => {
    return metaService.getSchema(input.schemaName)
  },
})
