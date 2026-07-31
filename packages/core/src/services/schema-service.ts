export interface SchemaService {
  compileSchema: (name: string, value: any) => Promise<void> | void

  validateSchema: (schema: string, data: any) => Promise<void> | void

  getSchemaNames: () => Set<string>

  /** Empty when the schema is not registered. */
  getSchemaKeys: (schemaName: string) => string[]
}
