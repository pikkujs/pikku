import { createGenerator, RootlessError } from 'ts-json-schema-generator'
import { CLILogger, writeFileInDir } from './utils.js'
import { mkdir, writeFile } from 'fs/promises'
import { FunctionsMeta, JSONValue } from '@pikku/core'
import { HTTPRoutesMeta } from '@pikku/core/http'
import { TypesMap } from '@pikku/inspector'

export async function generateSchemas(
  logger: CLILogger,
  tsconfig: string,
  typesMap: TypesMap,
  functionMeta: FunctionsMeta,
  httpRoutesMeta: HTTPRoutesMeta
): Promise<Record<string, JSONValue>> {
  const schemasSet = new Set(typesMap.customTypes.keys())
  for (const { inputs, outputs } of Object.values(functionMeta)) {
    const types = [...(inputs || []), ...(outputs || [])]
    for (const type of types) {
      const uniqueName = typesMap.getUniqueName(type)
      if (uniqueName) {
        schemasSet.add(uniqueName)
      }
    }
  }
  for (const { inputTypes } of httpRoutesMeta) {
    if (inputTypes?.body) {
      schemasSet.add(inputTypes.body)
    }
    if (inputTypes?.query) {
      schemasSet.add(inputTypes.query)
    }
    if (inputTypes?.params) {
      schemasSet.add(inputTypes.params)
    }
  }

  const generator = createGenerator({
    tsconfig,
    skipTypeCheck: true,
    topRef: false,
    discriminatorType: 'open-api',
    expose: 'export',
    jsDoc: 'extended',
    sortProps: true,
    strictTuples: false,
    encodeRefs: false,
    additionalProperties: false,
  })
  const schemas: Record<string, JSONValue> = {}
  schemasSet.forEach((schema) => {
    try {
      schemas[schema] = generator.createSchema(schema) as JSONValue
    } catch (e) {
      // Ignore rootless errors
      if (e instanceof RootlessError) {
        logger.error(`Error generating schema since it has no root: ${schema}`)
        return
      }
      logger.error(`Error generating schema: ${schema}`)
    }
  })

  return schemas
}

export async function saveSchemas(
  logger: CLILogger,
  schemaParentDir: string,
  schemas: Record<string, JSONValue>,
  typesMap: TypesMap,
  functionsMeta: FunctionsMeta,
  supportsImportAttributes: boolean
) {
  await writeFileInDir(
    logger,
    `${schemaParentDir}/register.gen.ts`,
    'export const empty = null;'
  )

  const desiredSchemas = new Set([
    ...Object.values(functionsMeta)
      .map(({ inputs, outputs }) => [
        inputs?.[0] ? typesMap.getUniqueName(inputs[0]) : undefined,
        outputs?.[0] ? typesMap.getUniqueName(outputs[0]) : undefined,
      ])
      .flat()
      .filter(
        (s) =>
          !!s &&
          !['boolean', 'string', 'number', 'null', 'undefined'].includes(s)
      ),
    ...typesMap.customTypes.keys(),
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

  const schemaImports = Array.from(desiredSchemas)
    .map(
      (schema) => `
import * as ${schema} from './schemas/${schema}.schema.json' ${supportsImportAttributes ? `with { type: 'json' }` : ''}
addSchema('${schema}', ${schema})
`
    )
    .join('\n')

  await writeFileInDir(
    logger,
    `${schemaParentDir}/register.gen.ts`,
    `import { addSchema } from '@pikku/core/schema'
${schemaImports}`,
    { logWrite: true }
  )
}
