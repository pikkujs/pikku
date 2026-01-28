/**
 * Interface for a schema service that handles schema compilation, validation, and management.
 */
export interface SchemaService {
  /**
   * Compiles a schema with the provided name and value, making it available for use.
   * @param {string} name - The unique name for the schema.
   * @param {any} value - The schema definition or configuration to be compiled.
   * @returns {Promise<void> | void} A promise if asynchronous, or void if synchronous.
   */
  compileSchema: (name: string, value: any) => Promise<void> | void

  /**
   * Validates data against a specified schema.
   * @param {string} schema - The name of the schema to validate against.
   * @param {any} data - The data to validate against the schema.
   * @returns {Promise<void> | void} A promise if asynchronous, or void if synchronous.
   */
  validateSchema: (schema: string, data: any) => Promise<void> | void

  /**
   * Retrieves a set of all registered schema names.
   * @returns {Set<string>} A set containing the names of all available schemas.
   */
  getSchemaNames: () => Set<string>

  /**
   * Retrieves the property keys from a compiled JSON schema.
   * @param {string} schemaName - The name of the schema.
   * @returns {string[]} An array of property keys, or empty array if schema not found.
   */
  getSchemaKeys: (schemaName: string) => string[]
}
