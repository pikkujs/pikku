// Reference for schema generation: run the TS inspector with a schemaConfig and
// dump what generateAllSchemas saw and produced, for the Go parity test
// (internal/schemas/parity_test.go).
// usage: node ref-schemas.mjs <projectDir> <outJson>
//
// The output holds:
//   config     the schemaConfig, minus cacheDir (the disk cache would skip the
//              generator and make the timing meaningless)
//   preState   serializeInspectorState(state) taken on entry to
//              generateAllSchemas, before Zod conversion adds custom types
//   schemas    its result
//   customTypes  the virtual file's source, from the typesMap after Zod
//              conversion (what the TS-type generator compiled)
//   ms         generateAllSchemas wall time
//   errors     what it passed to logger.error
//   timings    its [TIMING] and schema-program debug lines
//
// generateAllSchemas is not reachable from outside inspect(), so a resolve hook
// swaps inspector.js's import of it for a wrapper that snapshots and times it.
import { readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const DIST = WT + '/packages/inspector/dist'
const realURL = pathToFileURL(DIST + '/utils/schema-generator.js').href
const serializeURL = pathToFileURL(DIST + '/utils/serialize-inspector-state.js').href
const customTypesURL = pathToFileURL(DIST + '/utils/custom-types-generator.js').href

const wrapper = `
import * as real from '${realURL}?real'
import { serializeInspectorState } from '${serializeURL}'
import { generateCustomTypes } from '${customTypesURL}'
export * from '${realURL}?real'
export async function generateAllSchemas(logger, config, state) {
  globalThis.__pikkuRef.preState = JSON.stringify(serializeInspectorState(state))
  const t0 = performance.now()
  const out = await real.generateAllSchemas(logger, config, state)
  globalThis.__pikkuRef.ms = performance.now() - t0
  globalThis.__pikkuRef.schemas = JSON.stringify(out)
  globalThis.__pikkuRef.customTypes = generateCustomTypes(state.functions.typesMap, new Set())
  return out
}
`
const wrapperURL = 'data:text/javascript,' + encodeURIComponent(wrapper)
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './utils/schema-generator.js' && context.parentURL?.endsWith('/dist/inspector.js')) {
      return { url: wrapperURL, shortCircuit: true }
    }
    return next(specifier, context)
  },
})

const { glob } = await import(WT + '/node_modules/.bun/tinyglobby@0.2.17/node_modules/tinyglobby/dist/index.mjs')
const insp = await import(DIST + '/index.js')
const [projectDir, out] = process.argv.slice(2)
const cfg = JSON.parse(readFileSync(path.join(projectDir, 'pikku.config.json'), 'utf8'))
const rootDir = path.resolve(projectDir, cfg.rootDir ?? '.')
const ignore = cfg.ignoreFiles ?? ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**', '**/dist/**']
const files = (await Promise.all(cfg.srcDirectories.map((d) => glob('**/*.ts', { cwd: path.join(rootDir, d), ignore, absolute: true })))).flat()

globalThis.__pikkuRef = {}
const errors = []
const timings = []
const logger = {
  info() {}, warn() {}, diagnostic() {}, critical() {}, hasCriticalErrors: () => false,
  error(m) { errors.push(String(m)) },
  debug(m) { if (/TIMING|schema program/.test(m)) timings.push(String(m)) },
}
const schemaConfig = {
  tsconfig: path.resolve(projectDir, cfg.tsconfig),
  schemasFromTypes: cfg.schemasFromTypes,
  schema: cfg.schema,
}
const t0 = performance.now()
await insp.inspect(logger, files, { rootDir, tsconfig: schemaConfig.tsconfig, schemaConfig })
const totalMs = performance.now() - t0
const ref = globalThis.__pikkuRef
if (!ref.preState) throw new Error('generateAllSchemas was not called; is the resolve hook stale?')

// Not state.schemas: inspect() merges addon schemas into it afterwards.
writeFileSync(out, JSON.stringify({
  config: schemaConfig,
  preState: JSON.parse(ref.preState),
  schemas: JSON.parse(ref.schemas),
  customTypes: ref.customTypes,
  ms: ref.ms,
  errors,
  timings,
}))
console.log(JSON.stringify({
  project: projectDir, files: files.length,
  schemas: Object.keys(JSON.parse(ref.schemas)).length,
  schemaLookup: JSON.parse(ref.preState).schemaLookup.length,
  generateAllSchemasMs: Math.round(ref.ms), inspectMs: Math.round(totalMs), errors: errors.length,
  timings,
}))
