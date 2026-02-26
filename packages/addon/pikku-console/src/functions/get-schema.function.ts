import { pikkuSessionlessFunc } from '#pikku'
import type { JSONSchema7 } from 'json-schema'

export const getSchema = pikkuSessionlessFunc<
  { schemaName: string },
  JSONSchema7 | null
>({
  title: 'Get Schema',
  description:
    'Given a schemaName string, looks up and returns the corresponding JSONSchema7 definition from schemaService.getSchema(). Returns null if the schema does not exist.',
  expose: true,
  auth: false,
  func: async ({ schemaService }, input) => {
    return schemaService.getSchema(input.schemaName)
  },
})
