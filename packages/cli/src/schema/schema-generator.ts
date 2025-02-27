import { createGenerator, RootlessError } from 'ts-json-schema-generator'
import { logInfo, writeFileInDir } from '../utils.js'
import { mkdir, writeFile } from 'fs/promises'
import { JSONValue } from '@pikku/core'
import { HTTPRoutesMeta } from '@pikku/core/http'
import { TypesMap } from '@pikku/inspector'

export async function generateSchemas(
  tsconfig: string,
  typesMap: TypesMap,
  routesMeta: HTTPRoutesMeta
): Promise<Record<string, JSONValue>> {
  const schemasSet = new Set(typesMap.customTypes.keys())
  for (const { input, output, inputTypes } of routesMeta) {
    if (input) {
      schemasSet.add(typesMap.getTypeMeta(input).uniqueName)
    }
    if (output) {
      schemasSet.add(typesMap.getTypeMeta(output).uniqueName)
    }
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
  })
  const schemas: Record<string, JSONValue> = {}
  schemasSet.forEach((schema) => {
    try {
      schemas[schema] = generator.createSchema(schema) as JSONValue
    } catch (e) {
      // Ignore rootless errors
      if (e instanceof RootlessError) {
        console.error('Error generating schema since it has no root:', schema)
        return
      }
      throw e
    }
  })

  return schemas
}

export async function saveSchemas(
  schemaParentDir: string,
  schemas: Record<string, JSONValue>,
  typesMap: TypesMap,
  routesMeta: HTTPRoutesMeta,
  supportsImportAttributes: boolean
) {
  await writeFileInDir(
    `${schemaParentDir}/register.gen.ts`,
    'export const empty = null;'
  )

  const desiredSchemas = new Set([
    ...routesMeta
      .map(({ input, output }) => [
        input ? typesMap.getUniqueName(input) : undefined,
        output ? typesMap.getUniqueName(output) : undefined,
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
    logInfo(`• Skipping schemas since none found.\x1b[0m`)
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
// addSchema('${schema}', require('./schemas/${schema}.schema.json'))
`
    )
    .join('\n')

  await writeFileInDir(
    `${schemaParentDir}/register.gen.ts`,
    `import { addSchema } from '@pikku/core/schema'
// import { createRequire } from "module"
// const require = createRequire(import.meta.url)
${schemaImports}`
  )
}
