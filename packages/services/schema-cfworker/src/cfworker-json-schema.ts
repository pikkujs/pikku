import { Logger, SchemaService } from '@pikku/core'
import { UnprocessableContentError } from '@pikku/core'
import { Validator } from '@cfworker/json-schema'

export class CFWorkerSchemaService implements SchemaService {
  private validators = new Map<string, Validator>()

  constructor(private logger: Logger) {}

  public compileSchema(schema: string, value: any) {
    if (!this.validators.has(schema)) {
      this.logger.debug(`Adding json schema for ${schema}`)
      try {
        // We need to deep clone the value to avoid CFWorker's JSON schema validator
        // from mutating the original value (which throws an error)
        const validator = new Validator(JSON.parse(JSON.stringify(value)))
        this.validators.set(schema, validator)
      } catch (e: any) {
        throw e
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
      throw new UnprocessableContentError(result.errors.join(', '))
    }
  }

  public getSchemaNames(): Set<string> {
    return new Set(this.validators.keys())
  }
}
