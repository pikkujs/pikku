import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import type { JSONSchema7 } from 'json-schema'

export class SchemaService {
  private schemaCache = new Map<string, JSONSchema7>()

  constructor(private pikkuMetaPath: string) {}

  async getSchema(schemaName: string): Promise<JSONSchema7 | null> {
    if (this.schemaCache.has(schemaName)) {
      return this.schemaCache.get(schemaName)!
    }

    if (!/^[a-zA-Z0-9_\-\.]+$/.test(schemaName)) {
      return null
    }
    const schemasDir = resolve(this.pikkuMetaPath, 'schemas', 'schemas')
    const schemaPath = join(schemasDir, `${schemaName}.schema.json`)

    try {
      const content = await readFile(schemaPath, 'utf-8')
      const schema = JSON.parse(content) as JSONSchema7
      this.schemaCache.set(schemaName, schema)
      return schema
    } catch (error) {
      console.error(
        `Error reading schema ${schemaName} from ${schemaPath}:`,
        error
      )
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
