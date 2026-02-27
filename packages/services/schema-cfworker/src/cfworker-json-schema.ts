import type { Logger, SchemaService } from '@pikku/core/services'
import { UnprocessableContentError } from '@pikku/core/errors'
import { Validator } from '@cfworker/json-schema'

export class CFWorkerSchemaService implements SchemaService {
  private validators = new Map<string, Validator>()
  private schemas = new Map<string, any>()

  constructor(private logger: Logger) {}

  public compileSchema(schema: string, value: any) {
    if (!this.validators.has(schema)) {
      this.logger.debug(`Adding json schema for ${schema}`)
      try {
        // We need to deep clone the value to avoid CFWorker's JSON schema validator
        // from mutating the original value (which throws an error)
        const clonedValue = JSON.parse(JSON.stringify(value))
        const validator = new Validator(clonedValue)
        this.validators.set(schema, validator)
        this.schemas.set(schema, value)
      } catch {
        throw new Error(`Failed to compile schema: ${schema}`)
      }
    }
  }

  public validateSchema(schemaName: string, json: any) {
    const validator = this.validators.get(schemaName)
    if (!validator) {
      throw `Missing validator for ${schemaName}`
    }
    const result = validator.validate(json)
    if (!result.valid) {
      this.logger.error(
        `failed to validate request data against schema '${schemaName}'`,
        json,
        result.errors
      )
      throw new UnprocessableContentError(
        result.errors.map((e) => e.error || JSON.stringify(e)).join(', ')
      )
    }
  }

  public getSchemaNames(): Set<string> {
    return new Set(this.validators.keys())
  }

  public getSchemaKeys(schemaName: string): string[] {
    const schema = this.schemas.get(schemaName)
    if (!schema || !schema.properties) {
      return []
    }
    return Object.keys(schema.properties)
  }
}
