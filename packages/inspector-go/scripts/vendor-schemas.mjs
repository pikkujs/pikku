// Out-of-process half of schemas.NodeConverter: converts Standard Schema
// values (Zod only, as in the TS inspector) to JSON Schema for the Go
// inspector, which cannot evaluate user code itself.
// usage: node vendor-schemas.mjs  < schemaLookup.json  > result.json
//
// stdin:  the serialized schemaLookup, [[name, {variableName, sourceFile, vendor}], ...]
// stdout: {"schemas": [[name, {"schema": <JSON Schema>, "typeText": "<TS type>"}], ...],
//          "errors": ["<message>", ...]}
//
// The conversion is generateZodSchemas / processZodSchema from
// packages/inspector/src/utils/schema-generator.ts, line for line, minus the
// typesMap and logger: the Go side adds each typeText as a custom type and logs
// the errors itself. It resolves tsx, zod and the helpers from the installed
// @pikku/inspector package.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const INSPECTOR = path.dirname(
  path.dirname(createRequire(import.meta.url).resolve('@pikku/inspector'))
)
const requireFromInspector = createRequire(INSPECTOR + '/package.json')
const importFromInspector = (spec) => import(pathToFileURL(requireFromInspector.resolve(spec)).href)

// Bun imports TypeScript itself, and tsx's unregister() never settles under
// it — which is the runtime behind `node` in Pikku Studio. tsx is only for Node.
const register =
  typeof Bun === 'undefined'
    ? (await importFromInspector('tsx/esm/api')).register
    : () => () => {}
const z = await importFromInspector('zod')
const { zodToTypeText } = await import(pathToFileURL(INSPECTOR + '/dist/utils/zod-to-type-text.js').href)
const { findZodTransform } = await import(pathToFileURL(INSPECTOR + '/dist/utils/find-zod-transform.js').href)
const SCHEMA_TRANSFORM_NOT_SUPPORTED = 'PKU491'

const schemaRuntimeFile = (sourceFile) => {
  const match = /\.d\.([cm]?)ts$/.exec(sourceFile)
  if (!match) return sourceFile
  const emitted = sourceFile.replace(/\.d\.([cm]?)ts$/, '.$1js')
  return existsSync(emitted) ? emitted : sourceFile
}

function processZodSchema(schemaName, zodSchema, schemas) {
  const transformPath = findZodTransform(zodSchema)
  if (transformPath !== undefined) {
    const where = transformPath === '' ? 'the schema itself' : transformPath
    throw new Error(
      `[${SCHEMA_TRANSFORM_NOT_SUPPORTED}] '${schemaName}' contains a .transform() at ${where}.\n` +
        'A transform makes the value sent and the value received two different ' +
        'shapes, and a wire contract describes one: it cannot be expressed in ' +
        'JSON Schema or in the generated TypeScript.\n' +
        'Validate with the plain schema and apply the transform inside the ' +
        'function, or move it to the output type.'
    )
  }
  const schema = z.toJSONSchema(zodSchema, {
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema._zod?.def?.type === 'date') {
        jsonSchema.type = 'string'
        jsonSchema.format = 'date-time'
      }
    },
  })
  if (schema.required && schema.properties) {
    schema.required = schema.required.filter((fieldName) => {
      const prop = schema.properties[fieldName]
      return prop && prop.default === undefined
    })
    if (schema.required.length === 0) delete schema.required
  }
  schemas.push([schemaName, { schema, typeText: zodToTypeText(zodSchema) }])
}

const schemaLookup = new Map(JSON.parse(readFileSync(0, 'utf8')))
const schemas = []
const errors = []

const uniqueSourceFiles = [...new Set([...schemaLookup.values()].map((ref) => schemaRuntimeFile(ref.sourceFile)))]
const modules = new Map()
{
  const unregister = register()
  await Promise.allSettled(uniqueSourceFiles.map(async (file) => modules.set(file, await import(file))))
  await Promise.resolve(unregister()).catch(() => {})
}

const fallback = []
for (const [schemaName, ref] of schemaLookup) {
  const runtimeFile = schemaRuntimeFile(ref.sourceFile)
  const mod = modules.get(runtimeFile)
  if (!mod) {
    fallback.push([schemaName, ref])
    continue
  }
  const zodSchema = mod[ref.variableName]
  if (!zodSchema) {
    errors.push(`Could not find exported schema '${ref.variableName}' in ${runtimeFile} for ${schemaName}. Available exports: ${Object.keys(mod).join(', ')}`)
    continue
  }
  try {
    processZodSchema(schemaName, zodSchema, schemas)
  } catch (e) {
    errors.push(`Could not convert Zod schema '${schemaName}': ${e instanceof Error ? e.message : e}`)
  }
}

for (const [schemaName, ref] of fallback) {
  const runtimeFile = schemaRuntimeFile(ref.sourceFile)
  const unregister = register()
  try {
    const mod = await import(runtimeFile)
    const zodSchema = mod[ref.variableName]
    if (!zodSchema) {
      errors.push(`Could not find exported schema '${ref.variableName}' in ${runtimeFile} for ${schemaName}. Available exports: ${Object.keys(mod).join(', ')}`)
      continue
    }
    processZodSchema(schemaName, zodSchema, schemas)
  } catch (e) {
    errors.push(`Could not convert Zod schema '${schemaName}': ${e instanceof Error ? e.message : e}`)
  } finally {
    await Promise.resolve(unregister()).catch(() => {})
  }
}

// A user module can leave handles open (a pool, a timer), so exit once the
// answer is flushed rather than waiting for the event loop to drain.
process.stdout.write(JSON.stringify({ schemas, errors }), () => process.exit(0))
