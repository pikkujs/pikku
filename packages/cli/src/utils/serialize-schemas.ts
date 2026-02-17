import { writeFileInDir } from './file-writer.js'
import { mkdir, writeFile } from 'fs/promises'
import { JSONValue } from '@pikku/core'
import { CLILogger } from '../services/cli-logger.service.js'

function toValidIdentifier(name: string): string {
  let result = name.replace(/[-./]/g, '_')
  if (/^\d/.test(result)) {
    result = '_' + result
  }
  return result
}

export async function saveSchemas(
  logger: CLILogger,
  schemaParentDir: string,
  schemas: Record<string, JSONValue>,
  requiredSchemas: Set<string>,
  supportsImportAttributes: boolean,
  packageName?: string | null
) {
  await writeFileInDir(
    logger,
    `${schemaParentDir}/register.gen.ts`,
    'export const empty = null;'
  )

  if (requiredSchemas.size === 0) {
    logger.info(`• Skipping schemas since none found.\x1b[0m`)
    return
  }

  await mkdir(`${schemaParentDir}/schemas`, { recursive: true })
  await Promise.all(
    Object.entries(schemas).map(async ([schemaName, schema]) => {
      if (requiredSchemas.has(schemaName)) {
        await writeFile(
          `${schemaParentDir}/schemas/${schemaName}.schema.json`,
          JSON.stringify(schema),
          'utf-8'
        )
      }
    })
  )

  const availableSchemas = Array.from(requiredSchemas).filter(
    (schema) => schemas[schema]
  )

  const packageNameArg = packageName ? `, '${packageName}'` : ''

  const schemaImports = availableSchemas
    .map((schema) => {
      const identifier = toValidIdentifier(schema)
      return `
import * as ${identifier} from './schemas/${schema}.schema.json' ${supportsImportAttributes ? `with { type: 'json' }` : ''}
addSchema('${schema}', ${identifier}${packageNameArg})
`
    })
    .join('\n')

  const importStatement =
    availableSchemas.length > 0
      ? `import { addSchema } from '@pikku/core/schema'`
      : '// No schemas to register'

  await writeFileInDir(
    logger,
    `${schemaParentDir}/register.gen.ts`,
    `${importStatement}
${schemaImports}`,
    { logWrite: true }
  )
}
