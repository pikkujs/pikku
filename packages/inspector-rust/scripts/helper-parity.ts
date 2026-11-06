#!/usr/bin/env bun
/**
 * Differential tester for the helper methods (`pikku-inspect helper <m>` and
 * serve's `typeDiagnostics`). Feeds every method the same inputs, drawn from
 * the repository's own .ts/.tsx files plus mutated (malformed, non-ASCII)
 * variants, to the Go oracle and the Rust binary through `serve`, and compares
 * the response lines byte for byte.
 *
 *   bun helper-parity.ts <goBin> <rsBin> [--methods a,b] [--repo dir]
 *                        [--mutations N] [--limit N] [--show N] [--seed N]
 */
import { spawn } from 'node:child_process'
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    methods: { type: 'string' },
    repo: { type: 'string', default: resolve(dirname(import.meta.path), '../../..') },
    mutations: { type: 'string', default: '3' },
    limit: { type: 'string', default: '0' },
    show: { type: 'string', default: '3' },
    seed: { type: 'string', default: '1' },
    dirs: { type: 'string', default: '40' },
  },
})
const [goBin, rsBin] = positionals
if (!goBin || !rsBin) {
  console.error('usage: helper-parity.ts <goBin> <rsBin> [options]')
  process.exit(2)
}
const repo = values.repo!
const MUTATIONS = Number(values.mutations)
const LIMIT = Number(values.limit)
const SHOW = Number(values.show)

let seed = Number(values.seed)
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

type Case = { method: string; params: unknown; tag: string }

const git = (args: string[]) =>
  Bun.spawnSync(['git', '-C', repo, ...args]).stdout.toString().split('\n').filter(Boolean)

const tsFiles = git(['ls-files', '*.ts', '*.tsx', '*.mts', '*.cts']).filter(
  (f) => !f.includes('node_modules') && existsSync(join(repo, f))
)
const read = (f: string) => readFileSync(join(repo, f), 'utf8')

// ---- mutations: malformed and non-ASCII inputs -------------------------------
const mutate = (src: string): { name: string; text: string }[] => {
  const out: { name: string; text: string }[] = []
  if (!src.length) return out
  const pick = () => Math.floor(rand() * src.length)
  const kinds = [
    () => ({ name: 'truncate', text: src.slice(0, pick()) }),
    () => {
      const i = pick()
      return { name: 'delete-char', text: src.slice(0, i) + src.slice(i + 1) }
    },
    () => {
      const i = pick()
      return { name: 'emoji', text: src.slice(0, i) + '😀é' + src.slice(i) }
    },
    () => ({ name: 'emoji-head', text: '/* 日本語 😀 */\n' + src }),
    () => {
      const i = src.indexOf(')', pick())
      return i < 0 ? { name: 'noop', text: src } : { name: 'drop-paren', text: src.slice(0, i) + src.slice(i + 1) }
    },
    () => {
      const i = src.indexOf('{', pick())
      return i < 0 ? { name: 'noop', text: src } : { name: 'drop-brace', text: src.slice(0, i) + src.slice(i + 1) }
    },
    () => {
      const i = pick()
      return { name: 'crlf-ls', text: src.slice(0, i) + '\r\n\u2028' + src.slice(i) }
    },
  ]
  for (let k = 0; k < MUTATIONS; k++) out.push(kinds[Math.floor(rand() * kinds.length)]())
  return out
}

const fileInputs: { f: string; text: string; tag: string }[] = []
for (const f of tsFiles) {
  const text = read(f)
  fileInputs.push({ f, text, tag: f })
  for (const m of mutate(text)) fileInputs.push({ f, text: m.text, tag: `${f}#${m.name}` })
}

// edge-case snippets, always included
const SNIPPETS: Record<string, string> = {
  'a.ts': 'import {a} from "x"; export * from \'y\'; export {z} from "w"; import q = require("r"); import("dyn")',
  'b.tsx': 'const x = <div className="a b" title="Hello world">Some text here {cond ? "One two" : "Three four"}</div>',
  'c.ts': '',
  'd.ts': 'const s = "\\ud800"; let = ;;; class { } ((',
  'e.tsx': '<>  </>; <A b={1_000} c={0xff} d={`t`} e />',
  'f.ts': '\ufeffimport x from "bom"',
  'g.ts': 'export const a = pikkuFunc({ func: async () => 1, title: "😀 é", description: `d` })',
  'h.mts': 'import "side"; export type { T } from "t"',
  'i.tsx': 'a < b > c; const x = <T,>(y: T) => y; <div {...p} k="v"/>',
  'j.ts': 'let x = `unterminated ${',
  'k.ts': '/* unterminated comment',
  'l.ts': 'const re = /(/; const n = 08; const o = 0b2;',
}
for (const [f, text] of Object.entries(SNIPPETS)) {
  fileInputs.push({ f, text, tag: `snippet:${f}` })
  for (const m of mutate(text)) fileInputs.push({ f, text: m.text, tag: `snippet:${f}#${m.name}` })
}

// ---- case builders ------------------------------------------------------------
const cases: Case[] = []
const add = (method: string, params: unknown, tag: string) => cases.push({ method, params, tag })

for (const { f, text, tag } of fileInputs) {
  add('readSyntaxErrors', { fileName: f, content: text }, tag)
  add('readSyntaxErrors', { fileName: '', content: text }, tag + '#noname')
  add('readModuleSpecifiers', { fileName: f, content: text }, tag)
  add('readJsxLiteralText', { fileName: f, content: text }, tag)
  add('findWireRemoteAddonLiterals', { fileName: f, content: text }, tag)
  add('readImports', { content: text }, tag)
  if (/usePikku/.test(text) || f.endsWith('.tsx')) add('scanHooks', { file: f, text }, tag)
  for (const m of text.matchAll(/export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/g)) {
    add('findPikkuCall', { content: text, exportedName: m[1] }, `${tag}:${m[1]}`)
  }
  add('findPikkuCall', { content: text, exportedName: 'nope' }, tag + ':nope')
}

// batch forms: groups of 25 files
for (let i = 0; i < fileInputs.length; i += 25) {
  const files = fileInputs.slice(i, i + 25).map((x) => ({ fileName: x.f, content: x.text }))
  add('readModuleSpecifiersBatch', { files }, `batch@${i}`)
  add('readJsxLiteralTextBatch', { files }, `batch@${i}`)
}
add('readModuleSpecifiersBatch', { files: [] }, 'batch-empty')
add('readJsxLiteralTextBatch', {}, 'batch-missing')

// JSX positions: every `<Tag` in tsx sources (and mutated variants)
const utf16Pos = (text: string, idx: number) => {
  const before = text.slice(0, idx)
  const lines = before.split(/\r\n|\n|\r|\u2028|\u2029/)
  return { line: lines.length, col: lines[lines.length - 1].length }
}
const STYLES = [
  [{ prop: 'marginTop', value: '4px' }],
  [{ prop: 'color', value: null }],
  [{ prop: 'backgroundColor', value: 'red  blue' }, { prop: 'width', value: '  ' }],
]
const PROPS: unknown[] = ['hello "q" \\', 3, 0.5, -2, 1e21, true, false, null, ['x'], { a: 1 }]
let posBudget = LIMIT || 4000
for (const x of fileInputs) {
  if (!/\.tsx$/.test(x.f)) continue
  if (posBudget <= 0) break
  let n = 0
  for (const m of x.text.matchAll(/<([A-Za-z][\w.]*)/g)) {
    if (n++ >= 6 || posBudget-- <= 0) break
    const { line, col } = utf16Pos(x.text, m.index!)
    const p = { source: x.text, line, col }
    add('readJsxProps', p, `${x.tag}@${line}:${col}`)
    for (const [name, value] of [
      ['className', 'new'],
      ['title', PROPS[Math.floor(rand() * PROPS.length)]],
      ['data-x', 5],
      ['disabled', true],
      ['hidden', false],
      ['className', null],
      ['key', 0.5],
    ] as [string, unknown][])
      add('writeJsxProp', { ...p, name, value }, `${x.tag}@${line}:${col}:${name}`)
    for (const styles of STYLES) add('writeJsxStyle', { ...p, styles }, `${x.tag}@${line}:${col}:${JSON.stringify(styles)}`)
  }
}
// wrong-position probes
add('readJsxProps', { source: '<a b="1"/>', line: 1, col: 1 }, 'miss')
add('writeJsxProp', { source: '<a b="1"/>', line: 9, col: 0, name: 'x', value: 'y' }, 'miss')
add('writeJsxStyle', { source: '<a className={cn("p-1", cls)} />', line: 1, col: 0, styles: STYLES[0] }, 'cn')
add('writeJsxStyle', { source: '<a className={cn("[margin-top:4px]!")} />', line: 1, col: 0, styles: STYLES[0] }, 'cn2')
add('writeJsxStyle', { source: '<a className={foo()} />', line: 1, col: 0, styles: STYLES[0] }, 'err')
add('writeJsxStyle', { source: '<a />', line: 1, col: 0, styles: STYLES[0] }, 'noattr')
add('writeJsxStyle', { source: '<a className="x [margin-top:1px]!" />', line: 1, col: 0, styles: STYLES[1] }, 'rm')
add('writeJsxStyle', { source: '<a className={cn()} />', line: 1, col: 0, styles: STYLES[0] }, 'cn-empty')

// directory scans: the repo's packages, templates, recipes, verifiers and a few sub-trees
const dirSet = new Set<string>()
const topDirs: string[] = []
for (const top of ['packages', 'templates', 'recipes', 'verifiers', 'e2e']) {
  const t = join(repo, top)
  if (!existsSync(t)) continue
  topDirs.push(t)
  for (const d of readdirSync(t)) {
    const p = join(t, d)
    if (statSync(p).isDirectory()) dirSet.add(p)
  }
}
const dirs = [...dirSet].sort().slice(0, Number(values.dirs))
const extraDirs = [join(repo, 'packages/inspector-go/testdata'), join(repo, 'packages/react/src')].filter(existsSync)
for (const d of [...dirs, ...extraDirs]) {
  const tag = d.replace(repo, '')
  add('scanMessageUsage', { root: d }, tag)
  add('scanAsI18nArguments', { dir: d }, tag)
  add('scanAsI18nStubs', { dir: d }, tag)
  add('scanSepArguments', { dir: d }, tag)
  add('scanJsxLiteralText', { dir: d, allowed: ['OK', 'Cancel'], gated: false }, tag)
  add('scanJsxLiteralText', { dir: d, allowed: [], gated: true }, tag + '#gated')
  add('scanJsxLiteralProps', { dir: d, allowed: ['OK'], props: ['label', 'text'], helpers: ['say', 'toast'], gated: false }, tag)
  add('scanJsxLiteralProps', { dir: d, allowed: [], props: [], helpers: [], gated: true }, tag + '#gated')
  add('scanStringLiteralCopy', { dir: d, copyHelpers: [] }, tag)
  add('scanStringLiteralCopy', { dir: d, copyHelpers: ['say', 'toast'] }, tag + '#helpers')
}
add('scanMessageUsage', { root: '/nonexistent' }, 'missing-dir')
add('scanAsI18nArguments', { dir: '/nonexistent' }, 'missing-dir')

// frontends: every package that uses usePikku* hooks
const hookFiles = fileInputs.filter((x) => x.tag === x.f && /usePikku(Query|Mutation)/.test(x.text)).map((x) => x.f)
const byRoot = new Map<string, string[]>()
for (const f of hookFiles) {
  const parts = f.split('/')
  const root = parts.slice(0, parts[0] === 'packages' ? 2 : 2).join('/')
  byRoot.set(root, [...(byRoot.get(root) ?? []), join(repo, f)])
}
for (const [root, files] of byRoot) {
  add('scanFrontend', { rootDir: join(repo, root), files, client: '' }, root)
  add('scanFrontend', { rootDir: join(repo, root), files, client: '.pikku/pikku-rpc.gen.ts' }, root + '#client')
  add('scanFrontend', { rootDir: join(repo, root), files, client: 'src/pikku/index.ts' }, root + '#client2')
}

// tsconfig out dirs
for (const f of git(['ls-files', '*tsconfig*.json'])) add('readTsconfigOutDir', { tsconfig: join(repo, f) }, f)
add('readTsconfigOutDir', { tsconfig: '/nonexistent/tsconfig.json' }, 'missing')

// collectSurface: every package with a package.json
for (const f of git(['ls-files', '*/package.json'])) {
  const dir = dirname(join(repo, f))
  if (f.includes('node_modules')) continue
  add('collectSurface', { packageDir: dir }, f)
}
add('collectSurface', { packageDir: join(repo, 'packages/core'), subpaths: ['.'], snippets: [] }, 'core#snippets')
add('collectSurface', { packageDir: '/nonexistent' }, 'missing')

// method errors
add('readSyntaxErrors', {}, 'empty-params')
add('readModuleSpecifiers', { fileName: 'x.ts' }, 'no-content')

// ---- run -------------------------------------------------------------------------
const wanted = values.methods ? new Set(values.methods.split(',')) : null
const selected = cases.filter((c) => !wanted || wanted.has(c.method))

const serve = (bin: string, lines: string[]): Promise<string[]> =>
  new Promise((res, rej) => {
    const child = spawn(bin, ['serve'], { stdio: ['pipe', 'pipe', 'inherit'], cwd: repo })
    const chunks: Buffer[] = []
    child.stdout.on('data', (c) => chunks.push(c))
    child.on('error', rej)
    child.on('close', () => res(Buffer.concat(chunks).toString('utf8').split('\n').filter((l) => l.length)))
    child.stdin.on('error', () => {})
    child.stdin.end(lines.join('\n') + '\n')
  })

const methods = [...new Set(selected.map((c) => c.method))]
type Row = { method: string; total: number; diffs: number; samples: string[] }
const rows: Row[] = []
for (const method of methods) {
  const mc = selected.filter((c) => c.method === method)
  const lines = mc.map((c, i) => JSON.stringify({ id: i, method: c.method, params: c.params }))
  const [g, r] = await Promise.all([serve(goBin, lines), serve(rsBin, lines)])
  const row: Row = { method, total: mc.length, diffs: 0, samples: [] }
  const byId = (out: string[]) => {
    const m = new Map<number, string>()
    for (const l of out) {
      try {
        m.set(JSON.parse(l).id, l)
      } catch {
        /* unparseable line: reported as missing */
      }
    }
    return m
  }
  const gm = byId(g)
  const rm = byId(r)
  for (let i = 0; i < mc.length; i++) {
    const a = gm.get(i)
    const b = rm.get(i)
    if (a !== b) {
      row.diffs++
      if (row.samples.length < SHOW) {
        let k = 0
        if (a && b) while (k < a.length && a[k] === b[k]) k++
        row.samples.push(
          `  ${mc[i].tag}\n    go: ${a === undefined ? '(none)' : a.slice(Math.max(0, k - 60), k + 100)}\n    rs: ${b === undefined ? '(none)' : b.slice(Math.max(0, k - 60), k + 100)}`
        )
      }
    }
  }
  rows.push(row)
  console.log(`${method.padEnd(30)} ${String(row.total).padStart(6)} cases  ${row.diffs} differences`)
  for (const s of row.samples) console.log(s)
}
const total = rows.reduce((n, r) => n + r.total, 0)
const diffs = rows.reduce((n, r) => n + r.diffs, 0)
console.log(`\nhelper-parity: ${total} cases, ${diffs} differences across ${rows.length} methods`)
process.exit(diffs ? 1 : 0)
