// The esbuild half of zodjs.Converter (Go: internal/schemas/zodjs/converter.go),
// run under Node because Rust has no esbuild: bundle every module that declares a
// Zod schema, stubbing each import that is not zod, not part of the project and not
// resolvable, then run the bundle in a bare V8 context (no require, no Node
// built-ins: the conditions QuickJS gives Go). Input on stdin, one JSON object:
//   { dir, tsconfig, bases, env, platform, helpersJS, runnerJS, refs: [{name, sourceFile, schemaRef}] }
// Output on stdout, one JSON object: { result: {schemas, errors, fallback} } or { error }.
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import vm from 'node:vm'

const input = JSON.parse(readFileSync(0, 'utf8'))
const reply = (obj) => {
  const text = JSON.stringify(obj)
  const buf = Buffer.from(text)
  let off = 0
  while (off < buf.length) off += writeSync(1, buf, off)
  process.exit(0)
}

let esbuild
for (const base of [input.dir + '/', ...input.bases]) {
  try {
    esbuild = createRequire(base)('esbuild')
    break
  } catch {}
}
if (!esbuild) reply({ unavailable: 'esbuild is not installed where it can be resolved' })

const HELPERS = 'pikku:zod-helpers'
const RUNNER = 'pikku:zod-runner'
const STUB_NS = 'pikku-stub'
const SKIP = 'pikku-zodjs-resolving'
const quote = (s) => JSON.stringify(s)

const runtimeFile = (file) => {
  const m = /\.d\.([cm]?)ts$/.exec(file)
  if (!m) return file
  const emitted = file.replace(/\.d\.([cm]?)ts$/, `.${m[1]}js`)
  return existsSync(emitted) ? emitted : file
}

const index = new Map()
const files = []
const lookup = []
for (const ref of input.refs) {
  const file = runtimeFile(ref.sourceFile)
  let i = index.get(file)
  if (i === undefined) {
    i = index.size
    index.set(file, i)
    files.push(`{ file: ${quote(file)}, load: () => require(${quote(file)}) }`)
  }
  lookup.push(`[${quote(ref.name)}, ${JSON.stringify(ref.schemaRef)}, ${i}]`)
}
const entry =
  "import * as z from 'zod'\n" +
  `import { zodToTypeText, findZodTransform } from '${HELPERS}'\n` +
  `import { run } from '${RUNNER}'\n` +
  'globalThis.__pikkuResult = JSON.stringify(run({ z, zodToTypeText, findZodTransform,\n' +
  `  files: [${files.join(',\n')}],\n` +
  `  lookup: [${lookup.join(',\n')}] }))\n`

const prelude =
  'globalThis.global = globalThis;\n' +
  `globalThis.process = { env: ${JSON.stringify(input.env)}, argv: [], platform: ${quote(input.platform)}, versions: {}, cwd: () => ${quote(input.dir)} };`

const assetLoaders = {}
for (const ext of ['.css', '.scss', '.sass', '.less', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.md', '.html', '.txt', '.sql', '.wasm', '.node'])
  assetLoaders[ext] = 'empty'

const isZod = (p) => p === 'zod' || p.startsWith('zod/')
const inNodeModules = (p) => p.replaceAll('\\', '/').includes('/node_modules/')

const plugin = {
  name: 'pikku-zodjs',
  setup(b) {
    b.onResolve({ filter: /^pikku:/ }, (a) => ({ path: a.path, namespace: 'pikku' }))
    b.onLoad({ filter: /.*/, namespace: 'pikku' }, (a) => ({
      contents: a.path === HELPERS ? input.helpersJS : input.runnerJS,
      loader: 'js',
      resolveDir: input.dir,
    }))
    b.onResolve({ filter: /^[^./]/ }, async (a) => {
      if (a.pluginData === SKIP || isZod(a.path) || isAbsolute(a.path)) return undefined
      const r = await b.resolve(a.path, { importer: a.importer, resolveDir: a.resolveDir, kind: a.kind, pluginData: SKIP })
      if (r.errors.length === 0 && r.path !== '' && !r.external && !inNodeModules(r.path)) return { path: r.path, namespace: r.namespace }
      return { path: a.path, namespace: STUB_NS }
    })
    b.onLoad({ filter: /.*/, namespace: STUB_NS }, (a) => ({
      contents: `module.exports = require(${quote(RUNNER)}).createStub(${quote(a.path)})`,
      loader: 'js',
      resolveDir: input.dir,
    }))
  },
}

let bundle
try {
  const res = await esbuild.build({
    stdin: { contents: entry, resolveDir: input.dir, loader: 'js', sourcefile: 'zod-schemas-entry.js' },
    bundle: true,
    format: 'iife',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    conditions: ['import', 'default'],
    target: 'es2020',
    tsconfig: input.tsconfig && existsSync(input.tsconfig) ? input.tsconfig : undefined,
    banner: { js: prelude },
    loader: assetLoaders,
    logLevel: 'silent',
    write: false,
    plugins: [plugin],
  })
  bundle = res.outputFiles[0].text
} catch (e) {
  const first = e.errors?.[0]
  const loc = first?.location
  reply({ error: `bundling the modules that declare Zod schemas: ${first ? (loc ? `${loc.file}:${loc.line}: ${first.text}` : first.text) : e.message}` })
}

try {
  const sandbox = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {}, debug() {}, trace() {} } })
  const out = vm.runInContext(bundle + '\nglobalThis.__pikkuResult', sandbox, { timeout: 120000 })
  reply({ result: JSON.parse(out) })
} catch (e) {
  reply({ error: String(e?.message ?? e) })
}
