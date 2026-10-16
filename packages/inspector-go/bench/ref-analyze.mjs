// TS reference for the Go analysis: inspect() up to the finalize boundary,
// replayed from packages/inspector/dist step by step, then serialized.
// usage: node ref-analyze.mjs <projectDir> <outJson> [--schemas] [--setup-only]
// Writes {protocol, finalized:false, state, diagnostics, stats} like the Go
// binary. state.coreTypeProperties (Go-only) is derived from typesLookup.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const D = WT + '/packages/inspector/dist'
const { glob } = await import(WT + '/node_modules/.bun/tinyglobby@0.2.17/node_modules/tinyglobby/dist/index.mjs')
const ts = (await import(WT + '/packages/inspector/node_modules/typescript/lib/typescript.js')).default
const insp = await import(D + '/index.js')
const { visitSetup, visitFunctions, visitRoutes } = await import(D + '/visit.js')
const { loadAddonFunctionsMeta } = await import(D + '/utils/load-addon-functions-meta.js')
const { resolveLatestVersions } = await import(D + '/utils/resolve-versions.js')
const { validateWebhookSourceTriggers } = await import(D + '/add/add-trigger.js')
const { extractSecretUsage } = await import(D + '/utils/extract-secret-usage.js')
const { accumulateSurfaceUsage, surfaceUsageArea } = await import(D + '/utils/extract-surface-usage.js')
const { createNestedProjectFilter } = await import(D + '/utils/nested-project-filter.js')
const { toProgramPath } = await import(D + '/utils/program-path.js')
const { serializeInspectorState } = await import(D + '/utils/serialize-inspector-state.js')
const { generateAllSchemas } = await import(D + '/utils/schema-generator.js')

const argv = process.argv.slice(2)
const [projectDir, out] = argv.filter((a) => !a.startsWith('--'))
const withSchemas = argv.includes('--schemas')
const setupOnly = argv.includes('--setup-only')
const cfg = JSON.parse(readFileSync(path.join(projectDir, 'pikku.config.json'), 'utf8'))
const rootDir = path.resolve(projectDir, cfg.rootDir ?? '.')
const ignore = cfg.ignoreFiles ?? ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**', '**/dist/**']
const files = (await Promise.all(cfg.srcDirectories.map((d) => glob('**/*.ts', { cwd: path.join(rootDir, d), ignore, absolute: true })))).flat()
const tsconfig = cfg.tsconfig ? path.join(projectDir, cfg.tsconfig) : undefined

const diagnostics = []
const logger = {
  info() {}, debug() {},
  warn: (message) => diagnostics.push({ level: 'warn', message }),
  error: (message) => diagnostics.push({ level: 'error', message }),
  critical: (code, message) => diagnostics.push({ level: 'critical', code, message }),
  diagnostic: ({ severity, code, message }) => diagnostics.push({ level: severity, ...(code ? { code } : {}), message }),
  hasCriticalErrors: () => diagnostics.some((d) => d.level === 'critical'),
}

const t0 = performance.now()
const pathOpts = {}
if (tsconfig) {
  const cf = ts.readConfigFile(tsconfig, ts.sys.readFile)
  if (!cf.error && cf.config) {
    const { options: o } = ts.parseJsonConfigFileContent(cf.config, ts.sys, path.dirname(tsconfig))
    for (const k of ['baseUrl', 'paths', 'rootDirs', 'pathsBasePath']) if (o[k] !== undefined) pathOpts[k] = o[k]
  }
}
const compilerOptions = { ...pathOpts, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.Node16, skipLibCheck: true, skipDefaultLibCheck: true, moduleResolution: ts.ModuleResolutionKind.Node16, types: [], allowJs: false, checkJs: false }
const program = ts.createProgram(files.map((f) => path.resolve(f)), compilerOptions)
const checker = program.getTypeChecker()
const root = toProgramPath(rootDir)
const isNested = createNestedProjectFilter(root)
const sourceFiles = program.getSourceFiles()
  .filter((sf) => sf.fileName.startsWith(root) && !sf.fileName.includes('/node_modules/') && !isNested(sf.fileName))
  .sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0))
if (process.env.LIST_FILES) writeFileSync(process.env.LIST_FILES, sourceFiles.map((f) => f.fileName).join("\n"))
const state = insp.getInitialInspectorState(root)
const areaCache = new Map()
for (const sf of sourceFiles) {
  const usage = extractSecretUsage(sf)
  if (usage.keys.length > 0 || usage.dynamic.length > 0) state.secrets.usage.set(sf.fileName, usage)
  accumulateSurfaceUsage(sf, { area: surfaceUsageArea(sf.fileName, root, areaCache), file: path.relative(root, sf.fileName) }, state.surfaceUsage)
}
const options = { rootDir: root, tsconfig, setupOnly }
for (const sf of sourceFiles) ts.forEachChild(sf, (c) => visitSetup(logger, checker, c, state, { ...options, sourceFile: sf }))
await loadAddonFunctionsMeta(logger, state)
let schemaMs = null
if (!setupOnly) {
  for (const sf of sourceFiles) ts.forEachChild(sf, (c) => visitFunctions(logger, checker, c, state, { ...options, sourceFile: sf }))
  for (const sf of sourceFiles) ts.forEachChild(sf, (c) => visitRoutes(logger, checker, c, state, { ...options, sourceFile: sf }))
  validateWebhookSourceTriggers(logger, state)
  resolveLatestVersions(state, logger)
  if (withSchemas && tsconfig) {
    const ts0 = performance.now()
    state.schemas = await generateAllSchemas(logger, { tsconfig, schemasFromTypes: cfg.schemasFromTypes, cacheDir: path.join(projectDir, 'node_modules/.cache/pikku') }, state)
    schemaMs = Math.round(performance.now() - ts0)
  }
}
const wallMs = Math.round(performance.now() - t0)

const serialized = serializeInspectorState(state)
const core = {}
for (const m of [state.singletonServicesTypeImportMap, state.wireServicesTypeImportMap, state.userSessionTypeImportMap, state.configTypeImportMap]) {
  for (const vars of m.values()) for (const v of vars) {
    const t = state.typesLookup.get(v.variable)?.[0]
    if (t) core[v.variable] = t.getProperties().map((p) => p.getName()).sort()
  }
}
if (Object.keys(core).length) serialized.coreTypeProperties = core
writeFileSync(out, JSON.stringify({ protocol: 1, finalized: false, state: serialized, diagnostics, stats: { files: files.length, projectFiles: sourceFiles.length, wallMs, schemaMs, heapUsedMb: Math.round(process.memoryUsage().heapUsed / 2 ** 20) } }))
console.log(JSON.stringify({ files: files.length, projectFiles: sourceFiles.length, wallMs, schemaMs }))
