import type { JSONSchema7 } from 'json-schema'
import type { MetaService } from '@pikku/core/services'

export class SchemaService {
  private schemaCache = new Map<string, JSONSchema7>()

  constructor(private metaService: MetaService) {}

  async getSchema(schemaName: string): Promise<JSONSchema7 | null> {
    if (this.schemaCache.has(schemaName)) {
      return this.schemaCache.get(schemaName)!
    }

    if (!/^[a-zA-Z0-9_\-\.]+$/.test(schemaName)) {
      return null
    }

    try {
      const content = await this.metaService.readFile(
        `schemas/schemas/${schemaName}.schema.json`
      )
      if (!content) return null
      const schema = JSON.parse(content) as JSONSchema7
      this.schemaCache.set(schemaName, schema)
      return schema
    } catch (error) {
      console.error(`Error reading schema ${schemaName}:`, error)
      return null
    }
  }

  async getSchemas(
    schemaNames: string[]
  ): Promise<Record<string, JSONSchema7 | null>> {
    const results: Record<string, JSONSchema7 | null> = {}
    await Promise.all(
      schemaNames.map(async (name) => {
        results[name] = await this.getSchema(name)
      })
    )
    return results
  }

  clearCache(): void {
    this.schemaCache.clear()
  }
}
