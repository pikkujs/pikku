// Reference: run the TS inspector on a project and dump functions.meta + timings.
// usage: node ref.mjs <projectDir> <outJson> [full|slice]
//   full  = the whole inspect() (no schema generation, as with no schemaConfig)
//   slice = program + checker + visitFunctions only (the Go prototype's scope)
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const { glob } = await import(WT + '/node_modules/.bun/tinyglobby@0.2.17/node_modules/tinyglobby/dist/index.mjs')
const insp = await import(WT + '/packages/inspector/dist/index.js')
const [projectDir, out, mode = 'full'] = process.argv.slice(2)
const t0 = performance.now()
const cfg = JSON.parse(readFileSync(path.join(projectDir, 'pikku.config.json'), 'utf8'))
const rootDir = path.resolve(projectDir, cfg.rootDir ?? '.')
const ignore = cfg.ignoreFiles ?? ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**', '**/dist/**']
const files = (await Promise.all(cfg.srcDirectories.map((d) => glob('**/*.ts', { cwd: path.join(rootDir, d), ignore, absolute: true })))).flat()
let programMs = null
const logger = {
  info() {}, error() {}, warn() {}, diagnostic() {}, critical() {}, hasCriticalErrors: () => false,
  debug(m) { const r = /^Created program in (\d+)ms/.exec(m); if (r) programMs = +r[1] },
}
const tInspect = performance.now()
let meta
if (mode === 'full') {
  const state = await insp.inspect(logger, files, { rootDir, tsconfig: path.join(projectDir, cfg.tsconfig) })
  meta = state.functions.meta
} else {
  const ts = (await import(WT + '/packages/inspector/node_modules/typescript/lib/typescript.js')).default
  const { visitFunctions } = await import(WT + '/packages/inspector/dist/visit.js')
  const opts = { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16, skipLibCheck: true, skipDefaultLibCheck: true, types: [], allowJs: false, checkJs: false }
  const tp = performance.now()
  const program = ts.createProgram(files.map((f) => path.resolve(f)), opts)
  programMs = Math.round(performance.now() - tp)
  const checker = program.getTypeChecker()
  const state = insp.getInitialInspectorState(rootDir)
  const sfs = program.getSourceFiles().filter((sf) => sf.fileName.startsWith(rootDir) && !sf.fileName.includes('/node_modules/')).sort((a, b) => (a.fileName < b.fileName ? -1 : 1))
  for (const sf of sfs) ts.forEachChild(sf, (c) => visitFunctions(logger, checker, c, state, { sourceFile: sf }))
  meta = state.functions.meta
}
const inspectMs = performance.now() - tInspect
writeFileSync(out, JSON.stringify(meta, null, 2))
if (process.env.DUMP_FILES) writeFileSync(process.env.DUMP_FILES, files.slice().sort().join('\n'))
console.log(JSON.stringify({ mode, files: files.length, functions: Object.keys(meta).length, programMs, inspectMs: Math.round(inspectMs), totalMs: Math.round(performance.now() - t0) }))
