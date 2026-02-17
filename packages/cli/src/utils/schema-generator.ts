import { writeFileInDir } from './file-writer.js'
import { mkdir, writeFile } from 'fs/promises'
import { FunctionsMeta, JSONValue } from '@pikku/core'
import { TypesMap, SchemaRef } from '@pikku/inspector'
import { CLILogger } from '../services/cli-logger.service.js'

function toValidIdentifier(name: string): string {
  let result = name.replace(/[-./]/g, '_')
  if (/^\d/.test(result)) {
    result = '_' + result
  }
  return result
}

const PRIMITIVE_TYPES = new Set([
  'boolean',
  'string',
  'number',
  'null',
  'undefined',
  'void',
  'any',
  'unknown',
  'never',
])

export async function saveSchemas(
  logger: CLILogger,
  schemaParentDir: string,
  schemas: Record<string, JSONValue>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  supportsImportAttributes: boolean,
  additionalTypes?: string[],
  schemaLookup?: Map<string, SchemaRef>,
  packageName?: string | null
) {
  await writeFileInDir(
    logger,
    `${schemaParentDir}/register.gen.ts`,
    'export const empty = null;'
  )

  const desiredSchemas = new Set<string>([
    ...Object.values(functionsMeta)
      .map(({ inputs, outputs }) => {
        const types: (string | undefined)[] = []
        if (inputs?.[0]) {
          try {
            types.push(typesMap.getUniqueName(inputs[0]))
          } catch {
            types.push(inputs[0])
          }
        }
        if (outputs?.[0]) {
          try {
            types.push(typesMap.getUniqueName(outputs[0]))
          } catch {
            types.push(outputs[0])
          }
        }
        return types
      })
      .flat()
      .filter((s): s is string => !!s && !PRIMITIVE_TYPES.has(s)),
    ...typesMap.customTypes.keys(),
    ...(additionalTypes || []),
    ...(schemaLookup ? Array.from(schemaLookup.keys()) : []),
  ])

  if (desiredSchemas.size === 0) {
    logger.info(`• Skipping schemas since none found.\x1b[0m`)
    return
  }

  await mkdir(`${schemaParentDir}/schemas`, { recursive: true })
  await Promise.all(
    Object.entries(schemas).map(async ([schemaName, schema]) => {
      if (desiredSchemas.has(schemaName)) {
        await writeFile(
          `${schemaParentDir}/schemas/${schemaName}.schema.json`,
          JSON.stringify(schema),
          'utf-8'
        )
      }
    })
  )

  const availableSchemas = Array.from(desiredSchemas).filter(
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
