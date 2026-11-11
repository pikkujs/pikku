/**
 * Validates function input against the JSON schemas generated from your types,
 * provided as the `schema` singleton service (for example `@pikku/schema-ajv`
 * or `@pikku/schema-cfworker`).
 *
 * `validateSchema` must throw when the data does not match; the implementations
 * throw `UnprocessableContentError` (422). When no schema service is
 * configured, input is not validated.
 */
export interface SchemaService {
  compileSchema: (name: string, value: any) => Promise<void> | void

  validateSchema: (schema: string, data: any) => Promise<void> | void

  getSchemaNames: () => Set<string>

  /** Empty when the schema is not registered. */
  getSchemaKeys: (schemaName: string) => string[]
}
