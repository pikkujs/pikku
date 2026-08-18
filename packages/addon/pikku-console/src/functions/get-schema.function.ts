import { pikkuFunc } from '#pikku/addon/function'
import type { JSONSchema7 } from 'json-schema'

export const getSchema = pikkuFunc<{ schemaName: string }, JSONSchema7 | null>({
  title: 'Get Schema',
  description:
    'Given a schemaName string, looks up and returns the corresponding JSONSchema7 definition from metaService.getSchema(). Returns null if the schema does not exist.',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ metaService }, input) => {
    return metaService.getSchema(input.schemaName)
  },
})
