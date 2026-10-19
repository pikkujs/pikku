/**
 * Parity for the `pikku-inspect helper` methods: each runs over every source
 * file of the given projects through both engines and the results are
 * compared exactly. collectSurface is compared per symbol, both exactly and
 * with union members sorted (the tsgo-custom-type-ordering class).
 *
 *   bun parity/helpers.ts [--bin <pikku-inspect>] [--project <dir>]...
 *
 * Defaults to templates/online-shop and every template. Exit status 1 when a
 * helper differs beyond union order. PARITY_DUMP=<dir> writes both sides of a
 * differing surface there, union-sorted.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readJsxLiteralText,
  readModuleSpecifiers,
  readTsconfigOutDir,
} from '@pikku/inspector'
import { collectSurface } from '@pikku/inspector/surface'
import {
  frontendFiles,
  scanFrontend,
  scanHooks,
} from '../../cli/src/functions/mocks/stub-scan.ts'
import * as go from '../src/helpers.ts'
import { sortTypeString } from './normalize.ts'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))

const args = process.argv.slice(2)
const flag = (name: string) =>
  args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]!] : []))
const bin = flag('--bin')[0]
if (bin) process.env.PIKKU_INSPECTOR_GO_BIN = resolve(bin)

const projects = flag('--project').length
  ? flag('--project').map((p) => resolve(p))
  : [
      join(REPO, 'templates/online-shop'),
      ...readdirSync(join(REPO, 'recipes'))
        .map((t) => join(REPO, 'recipes', t))
        .filter((d) => existsSync(join(d, 'package.json'))),
    ]

const SKIP = new Set(['node_modules', 'dist', '.git', '.turbo'])
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.[mc]?[jt]sx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

type Tally = { compared: number; differing: string[] }
const tally = (): Tally => ({ compared: 0, differing: [] })
const results: Record<string, Tally> = {
  readJsxLiteralText: tally(),
  readModuleSpecifiers: tally(),
  readTsconfigOutDir: tally(),
  scanHooks: tally(),
  scanFrontend: tally(),
}
const surface = {
  compared: 0,
  exact: 0,
  unionOrder: 0,
  differing: [] as string[],
}

const check = (method: string, key: string, ts: unknown, got: unknown) => {
  results[method]!.compared++
  if (!same(ts, got)) results[method]!.differing.push(key)
}

/**
 * A symbol with its union members sorted. Member lines are re-sorted too, as
 * a member's place can follow the order its own type printed in.
 */
const sortUnions = (s: string): string => {
  const ctor = /^(new [\w$]+)\((.*)\)$/s.exec(s)
  if (!ctor) return sortTypeString(s)
  return `${ctor[1]}(${ctor[2]!
    .split(', ')
    .map((p) =>
      p.replace(/^([\w$]+\??: )(.*)$/s, (_, n, t) => n + sortTypeString(t))
    )
    .join(', ')})`
}
const unionSorted = (entrypoints: any[]): any =>
  entrypoints.map((entry) => ({
    ...entry,
    symbols: entry.symbols.map((symbol: any) => ({
      ...symbol,
      signature: symbol.signature && sortUnions(symbol.signature),
      members: symbol.members
        ?.map((m: any) => ({
          ...m,
          line: m.line.replace(
            /^([^:]+?\??: )(.*)$/s,
            (_: string, n: string, t: string) => n + sortTypeString(t)
          ),
        }))
        .sort((a: any, b: any) => a.line.localeCompare(b.line)),
    })),
  }))

for (const project of projects) {
  const files = sources(project).map((fileName) => ({
    fileName,
    content: readFileSync(fileName, 'utf8'),
  }))
  const jsx = files.filter((f) => /\.[jt]sx$/.test(f.fileName))
  const jsxBatch = go.readJsxLiteralTextBatch(jsx)
  jsx.forEach((f, i) =>
    check(
      'readJsxLiteralText',
      f.fileName,
      readJsxLiteralText(f.fileName, f.content),
      jsxBatch[i]
    )
  )
  const specBatch = go.readModuleSpecifiersBatch(files)
  files.forEach((f, i) =>
    check(
      'readModuleSpecifiers',
      f.fileName,
      readModuleSpecifiers(f.fileName, f.content),
      specBatch[i]
    )
  )
  for (const f of files
    .filter((f) => /\.tsx?$/.test(f.fileName))
    .slice(0, 40)) {
    check(
      'scanHooks',
      f.fileName,
      scanHooks(f.fileName, f.content),
      go.scanHooks(f.fileName, f.content)
    )
  }
  const tsconfig = join(project, 'tsconfig.json')
  if (existsSync(tsconfig)) {
    check(
      'readTsconfigOutDir',
      tsconfig,
      readTsconfigOutDir(tsconfig),
      go.readTsconfigOutDir(tsconfig)
    )
  }
  const front = frontendFiles(project)
  let client: string | undefined
  try {
    client = JSON.parse(
      readFileSync(join(project, 'pikku.config.json'), 'utf8')
    ).clientFiles?.reactQueryFile
  } catch {}
  check(
    'scanFrontend',
    project,
    scanFrontend(project, front, client),
    go.scanFrontend(project, front, client)
  )

  if (existsSync(join(project, '.pikku'))) {
    const options = { importsSubpath: '#pikku/*' }
    // Entrypoints follow readdir order, which Node sorts and Bun does not, so
    // they are compared by subpath; Go's order is Node's.
    const bySubpath = (entries: { subpath: string }[]) =>
      [...entries].sort((x, y) =>
        x.subpath < y.subpath ? -1 : x.subpath > y.subpath ? 1 : 0
      )
    const ts = bySubpath(await collectSurface(project, options))
    const got = bySubpath(await go.collectSurface(project, options))
    surface.compared++
    if (same(ts, got)) surface.exact++
    else if (same(unionSorted(ts), unionSorted(got))) surface.unionOrder++
    else {
      surface.differing.push(project)
      if (process.env.PARITY_DUMP) {
        const { writeFileSync } = await import('node:fs')
        const name = project.split('/').pop()
        writeFileSync(
          `${process.env.PARITY_DUMP}/${name}-ts.json`,
          JSON.stringify(unionSorted(ts), null, 1)
        )
        writeFileSync(
          `${process.env.PARITY_DUMP}/${name}-go.json`,
          JSON.stringify(unionSorted(got), null, 1)
        )
      }
    }
  }
}

let failed = false
for (const [method, { compared, differing }] of Object.entries(results)) {
  console.log(`${method}: ${compared - differing.length}/${compared} identical`)
  for (const key of differing) console.log(`  differs: ${key}`)
  failed ||= differing.length > 0
}
console.log(
  `collectSurface: ${surface.exact}/${surface.compared} identical, ` +
    `${surface.unionOrder} differ only in union order (tsgo-custom-type-ordering)`
)
for (const key of surface.differing) console.log(`  differs: ${key}`)
failed ||= surface.differing.length > 0
process.exit(failed ? 1 : 0)
