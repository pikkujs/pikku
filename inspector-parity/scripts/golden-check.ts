#!/usr/bin/env bun
/**
 * Keeps the committed Go goldens honest.
 *
 *   bun golden-check.ts [goBin] [--update] [--only addon-load,trigger_feature,workflow_edge]
 *
 * The Rust cargo tests compare against three committed files, each a slice of
 * what the Go inspector prints for a small fixture:
 *
 *   fixtures/addon-load/go.golden.json        tests/addons_checks.rs
 *   fixtures/trigger_feature/expected.go.json tests/trigger_feature_fixture.rs
 *   fixtures/workflow_edge/golden.json        tests/workflow_fixtures.rs
 *
 * Go is the reference, so a golden that no longer matches Go is stale. This
 * runs Go on each fixture, takes the same slice the Rust test compares, and
 * fails when it differs from the committed file. `--update` rewrites the
 * files instead (review the diff: a change means Go's answer moved).
 *
 * The slice, the request and the root placeholder mirror the Rust tests;
 * change them together. Key order is part of the comparison, as it is there.
 *
 * goBin: argument, then PIKKU_INSPECTOR_GO_BIN, then packages/inspector-go/bin/pikku-inspect.
 * Exit: 0 all match (or updated), 1 stale, 2 could not run Go.
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_GO, REPO_ROOT, runBinary } from './lib.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    update: { type: 'boolean', default: false },
    only: { type: 'string' },
    timeout: { type: 'string', default: '120' },
  },
})
const goBin = resolve(positionals[0] ?? process.env.PIKKU_INSPECTOR_GO_BIN ?? DEFAULT_GO)
const FIXTURES = join(REPO_ROOT, 'inspector-parity/fixtures')

type Json = any
interface Run {
  /** Directory Go analyses (the fixture, or a materialised copy). */
  root: string
  routeFiles: string[]
  options: Record<string, unknown>
}
interface Spec {
  name: string
  golden: string
  /** The text the root path is replaced with, as in the Rust test. */
  placeholder: string
  /**
   * Whether the golden is Go's finalized output (what `--stdin` prints) or its
   * pre-finalize analysis (`--no-finalize`). Finalize adds diagnostics such as
   * PKU575 and PKU124, so each golden has to be read the way it was captured.
   */
  finalize: boolean
  prepare(): Run
  /** Cut Go's response down to what the golden holds. */
  slice(go: Json, current: Json, root: string): Json
}

const tsFiles = (dir: string): string[] => {
  const out: string[] = []
  const walk = (d: string) => {
    if (!existsSync(d)) return
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) out.push(p)
    }
  }
  walk(dir)
  return out
}

/** `a.b` addresses state.a.b, a plain key addresses state[key]. */
const stateAt = (state: Json, key: string): Json => {
  const [a, b] = key.split('.', 2)
  return b === undefined ? state?.[a] : state?.[a]?.[b]
}
const codeIn = (codes: string[]) => (d: Json) => codes.includes(d.code)

const SPECS: Spec[] = [
  {
    name: 'addon-load',
    golden: join(FIXTURES, 'addon-load/go.golden.json'),
    placeholder: '<ROOT>',
    finalize: false,
    prepare() {
      // `modules` and `dot-pikku` are renamed on disk because a checkout
      // ignores or hides node_modules and .pikku.
      const dst = join(mkdtempSync(join(tmpdir(), 'golden-addon-load-')), 'fixture')
      cpSync(join(FIXTURES, 'addon-load'), dst, { recursive: true })
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name)
          const to = e.name === 'modules' ? 'node_modules' : e.name === 'dot-pikku' ? '.pikku' : e.name
          const q = join(d, to)
          if (to !== e.name) renameSync(p, q)
          if (e.isDirectory()) walk(q)
        }
      }
      walk(dst)
      return {
        root: dst,
        routeFiles: tsFiles(join(dst, 'src')),
        options: { rootDir: dst, tsconfig: join(dst, 'tsconfig.json') },
      }
    },
    slice(go, current) {
      // The keys the loader owns are whichever the committed file lists.
      const out: Json = {}
      for (const key of Object.keys(current)) {
        if (key === 'diagnostics') continue
        out[key] = stateAt(go.state, key)
      }
      out.diagnostics = (go.diagnostics ?? []).filter(
        (d: Json) =>
          codeIn(['PKU356', 'PKU363', 'PKU343', 'PKU364'])(d) || String(d.message).startsWith('wireAddon(')
      )
      return out
    },
  },
  {
    name: 'trigger_feature',
    golden: join(FIXTURES, 'trigger_feature/expected.go.json'),
    placeholder: '<fixture>',
    finalize: true,
    prepare() {
      const root = join(FIXTURES, 'trigger_feature')
      return {
        root,
        routeFiles: readdirSync(join(root, 'src'))
          .filter((f) => f.endsWith('.ts'))
          .sort()
          .map((f) => join(root, 'src', f)),
        options: { rootDir: root, tsconfig: join(root, 'tsconfig.json') },
      }
    },
    slice(go, current) {
      const state: Json = {}
      for (const key of Object.keys(current.state ?? {})) state[key] = stateAt(go.state, key)
      // The golden keeps every diagnostic; the Rust test drops the virtual-user
      // role check from both sides, so it stays here too.
      return { state, diagnostics: go.diagnostics ?? [] }
    },
  },
  {
    name: 'workflow_edge',
    golden: join(FIXTURES, 'workflow_edge/golden.json'),
    placeholder: '<root>',
    finalize: true,
    prepare() {
      const root = join(FIXTURES, 'workflow_edge')
      return {
        root,
        routeFiles: [join(root, 'wf.ts')],
        options: { rootDir: root, tsconfig: join(root, 'tsconfig.json'), allow: { complexWorkflows: true } },
      }
    },
    slice(go) {
      return {
        workflows: go.state?.workflows,
        invokedFunctions: go.state?.rpc?.invokedFunctions,
        diagnostics: (go.diagnostics ?? []).filter(codeIn(['PKU641', 'PKU643', 'PKU675', 'PKU679'])),
      }
    },
  },
]

/** One-space indent, no final newline, non-ASCII as \uXXXX: byte-for-byte what is committed. */
const serialise = (v: Json) =>
  JSON.stringify(v, null, 1).replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))

/** Path of the first leaf where two values differ, with both sides. */
const firstDiff = (a: Json, b: Json, path = ''): string | null => {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    for (const k of keysA) {
      if (!(k in b)) return `${path}.${k}: only in Go`
      const d = firstDiff(a[k], b[k], `${path}.${k}`)
      if (d) return d
    }
    for (const k of keysB) if (!(k in a)) return `${path}.${k}: only in committed golden`
    if (keysA.join() !== keysB.join()) return `${path}: key order differs (Go ${keysA.join(',')} / committed ${keysB.join(',')})`
  }
  const cut = (v: Json) => JSON.stringify(v)?.slice(0, 120)
  return `${path || '.'}: Go ${cut(a)} / committed ${cut(b)}`
}

if (!existsSync(goBin)) {
  console.error(`golden-check: no Go inspector at ${goBin}. Build one (see packages/inspector-go) or pass a path / set PIKKU_INSPECTOR_GO_BIN.`)
  process.exit(2)
}

const only = values.only?.split(',')
let stale = 0
let broken = 0
for (const spec of SPECS) {
  if (only && !only.includes(spec.name)) continue
  const run = spec.prepare()
  const request = JSON.stringify({ routeFiles: run.routeFiles, options: run.options })
  const res = await runBinary(goBin, spec.finalize ? ['--stdin'] : ['--stdin', '--no-finalize'], request, Number(values.timeout) * 1000)
  let go: Json
  try {
    go = JSON.parse(res.stdout.replaceAll(run.root, spec.placeholder))
  } catch {
    console.error(`FAIL  ${spec.name}: Go gave no JSON (exit ${res.exitCode}${res.timedOut ? ', timed out' : ''}): ${res.stderr.slice(0, 300)}`)
    broken++
    continue
  } finally {
    if (run.root !== join(FIXTURES, spec.name)) rmSync(join(run.root, '..'), { recursive: true, force: true })
  }
  const current = JSON.parse(readFileSync(spec.golden, 'utf8'))
  const fresh = spec.slice(go, current, run.root)
  const diff = firstDiff(fresh, current)
  if (!diff) {
    console.log(`ok    ${spec.name}`)
    continue
  }
  if (values.update) {
    writeFileSync(spec.golden, serialise(fresh))
    console.log(`wrote ${spec.name}  (${diff})`)
  } else {
    console.log(`STALE ${spec.name}: ${diff}`)
    stale++
  }
}
if (broken) process.exit(2)
if (stale) {
  console.error('\nA golden no longer matches Go. If Go changed on purpose, run with --update and review the diff.')
  process.exit(1)
}
