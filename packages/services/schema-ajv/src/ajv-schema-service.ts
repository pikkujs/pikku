import { Logger, SchemaService } from '@pikku/core'
import { Ajv } from 'ajv'
import addFormats from 'ajv-formats'
import { ValidateFunction } from 'ajv'
import { BadRequestError } from '@pikku/core/errors'

const ajv = new Ajv({
  removeAdditional: false,
  coerceTypes: true,
})
addFormats.default(ajv as any)

export class AjvSchemaService implements SchemaService {
  private validators = new Map<string, ValidateFunction>()

  constructor(private logger: Logger) {}

  public compileSchema(schema: string, value: any) {
    if (!this.validators.has(schema)) {
      this.logger.debug(`Adding json schema for ${schema}`)
      try {
        const validator = ajv.compile(value)
        this.validators.set(schema, validator)
      } catch (e: any) {
        throw e
      }
    }
  }

  public validateSchema(schemaName: string, json: any) {
    const validator = this.validators.get(schemaName)
    if (validator == null) {
      throw `Missing validator for ${schemaName}`
    }
    const result = validator(json)
    if (!result) {
      this.logger.error(
        `failed to validate request data against schema '${schemaName}'`,
        json,
        validator.errors
      )
      const errorText = ajv.errorsText(validator.errors)
      throw new BadRequestError(errorText)
    }
  }

  public getSchemaNames(): Set<string> {
    return new Set(this.validators.keys())
  }
}
