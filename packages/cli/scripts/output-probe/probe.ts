/**
 * CLI output probe — captures what a pikku CLI prints, and what it costs,
 * without running any command.
 *
 *   npx tsx scripts/output-probe/probe.ts                # in-process tiers only (fast)
 *   SPAWN=1 npx tsx scripts/output-probe/probe.ts        # adds spawned --help timings (~3 min)
 *
 * Writes $PIKKU_REPORT_DIR (default .pikku-cli-report)/{outputs.ndjson,timings.ndjson,summary.json}
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pikkuState } from '@pikku/core/state'
import { generateCommandHelp, parseCLIArguments } from '@pikku/core/cli'

const run = promisify(execFile)
const OUT = process.env.PIKKU_OUT ?? '.pikku'
const BIN = process.env.PIKKU_BIN ?? 'dist/bin/pikku.js'
const REPS = Number(process.env.REPS ?? 3)
const RESULTS = process.env.PIKKU_REPORT_DIR ?? '.pikku-cli-report'

/* ---------------- inventory ---------------- */
const meta = JSON.parse(readFileSync(join(OUT, 'cli/pikku-cli-wirings-meta.gen.json'), 'utf8'))
type Pos = { name: string; required?: boolean; variadic?: boolean }
type Leaf = { program: string; id: string; path: string[]; funcId: string; render?: string; positionals: Pos[]; hasSubcommands: boolean }
const leaves: Leaf[] = []
const walk = (program: string, cmds: any, path: string[]) => {
  for (const [n, c] of Object.entries<any>(cmds)) {
    const p = [...path, n]
    if (c.pikkuFuncId) leaves.push({ program, id: p.join('.'), path: p, funcId: c.pikkuFuncId, render: c.renderName, positionals: c.positionals ?? [], hasSubcommands: !!c.subcommands })
    if (c.subcommands) walk(program, c.subcommands, p)
  }
}
for (const [program, v] of Object.entries<any>(meta.programs)) walk(program, v.commands, [])

/* ---------------- colour ----------------
 * chalk fixes its level at import time from the TTY check, and the probe's
 * stdout is a pipe — so renderers would capture as stripped monochrome. The
 * renderers share this singleton, so raising it here colours their output.
 */
const { default: chalk } = await import('chalk')
chalk.level = Number(process.env.PROBE_COLOR_LEVEL ?? 3) as 0 | 1 | 2 | 3

/* ---------------- registries: importing registers, it never executes ---------------- */
const wiringUrl = (f: string) => pathToFileURL(join(process.cwd(), OUT, 'cli', f)).href
await import(wiringUrl('pikku-cli-wirings-meta.gen.js'))
await import(wiringUrl('pikku-cli-wirings.gen.js'))
const programs: any = pikkuState(null, 'cli', 'programs')
const fnMeta = JSON.parse(readFileSync(join(OUT, 'function/pikku-functions-meta.gen.json'), 'utf8'))
const schemaFor = (funcId: string) => {
  const name = fnMeta[funcId]?.outputSchemaName
  const f = name && join(OUT, 'schemas/schemas', `${name}.schema.json`)
  return f && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : undefined
}

/* ---------------- payload synthesis from the output schema ---------------- */
type Mode = 'minimal' | 'typical' | 'many' | 'extremes'
const deref = (s: any, root: any, depth = 0): any => {
  if (!s || depth > 8) return s
  if (s.$ref) {
    const path = String(s.$ref).replace(/^#\//, '').split('/')
    return deref(path.reduce((o: any, k) => o?.[k], root), root, depth + 1)
  }
  return s
}
const gen = (raw: any, key: string, mode: Mode, seed = 0, holes: string[] = [], root?: any, depth = 0): any => {
  const r = root ?? raw
  const s = deref(raw, r, 0)
  if (!s || depth > 10) return undefined
  if (s.const !== undefined) return s.const
  if (s.enum) return s.enum[seed % s.enum.length]
  // A union picks a branch by seed, so the four modes walk different arms of
  // an anyOf rather than all landing on the first one.
  const union = s.anyOf ?? s.oneOf
  if (union) return gen(union[seed % union.length], key, mode, seed, holes, r, depth + 1)
  if (s.allOf) return s.allOf.reduce((acc: any, part: any) => ({ ...acc, ...gen(part, key, mode, seed, holes, r, depth + 1) }), {})
  // A property declared as `{}` carries no type, so nothing can be invented for
  // it. Record the hole rather than guessing — a renderer that then throws is
  // the probe's fault, not the CLI's, and must not be reported as a finding.
  const type = Array.isArray(s.type) ? s.type.find((t: string) => t !== 'null') ?? 'null' : s.type
  if (!type && !s.properties && !s.items && !s.additionalProperties) { holes.push(key); return null }
  switch (type ?? (s.properties || s.additionalProperties ? 'object' : 'array')) {
    case 'object': {
      const o: any = {}
      for (const [k, v] of Object.entries<any>(s.properties ?? {})) {
        if (mode === 'minimal' && !(s.required ?? []).includes(k)) continue
        o[k] = gen(v, k, mode, seed, holes, r, depth + 1)
      }
      // `additionalProperties: {schema}` is a keyed map — give it real keys.
      if (s.additionalProperties && typeof s.additionalProperties === 'object' && mode !== 'minimal')
        for (let i = 0; i < 2; i++) o[`${key}${i + 1}`] = gen(s.additionalProperties, key, mode, seed + i, holes, r, depth + 1)
      return o
    }
    case 'array': {
      const n = mode === 'minimal' ? 0 : mode === 'typical' ? 2 : mode === 'many' ? 12 : 1
      return Array.from({ length: n }, (_, i) => gen(s.items, key, mode === 'many' ? 'typical' : mode, seed + i, holes, r, depth + 1))
    }
    case 'boolean': return mode !== 'minimal'
    case 'number': case 'integer': return mode === 'extremes' ? 1234567 : mode === 'many' ? 42 : 3
    case 'null': return null
    default:
      return mode === 'extremes' ? `${key}—ünïcødé—${'x'.repeat(120)}` : key
  }
}

/* ---------------- capture + timing ---------------- */
const capture = async (fn: Function, data: any) => {
  const chunks: string[] = []
  const w = process.stdout.write.bind(process.stdout)
  const e = process.stderr.write.bind(process.stderr)
  ;(process.stdout as any).write = (c: any) => (chunks.push(String(c)), true)
  ;(process.stderr as any).write = (c: any) => (chunks.push(String(c)), true)
  const t = performance.now()
  let threw: string | undefined
  try { await fn({}, data) } catch (err: any) { threw = err?.message ?? String(err) }
  const ms = performance.now() - t
  ;(process.stdout as any).write = w
  ;(process.stderr as any).write = e
  return { ms, output: chunks.join(''), threw }
}
const minOf = async <T extends { ms: number }>(fn: () => Promise<T> | T): Promise<T> => {
  let best: any
  for (let i = 0; i < REPS; i++) { const r = await fn(); if (!best || r.ms < best.ms) best = r }
  return best
}

const outputs: any[] = []
const timings: any[] = []
const record = (row: any, ms: number, output: string, extra: any = {}) => {
  outputs.push({ ...row, ...extra, bytes: output.length, output })
  timings.push({ ...row, ...extra, ms: +ms.toFixed(3), bytes: output.length })
}

/* ---------------- tier: help (pure, from meta) ---------------- */
for (const leaf of leaves) {
  const r = await minOf(() => {
    const t = performance.now()
    const text = generateCommandHelp(leaf.program, meta, leaf.path)
    return { ms: performance.now() - t, text }
  })
  record({ tier: 'help', program: leaf.program, command: leaf.path.join(' '), case: 'help', observed: false }, r.ms, r.text)
}

/* ---------------- tier: parse errors (pure, from meta) ---------------- */
// Derived from each command's own signature: a bogus trailing word is a
// *valid* argument to a command with a variadic positional, so a fixed case
// list measures nothing. Required arity is what the parser actually guards.
const parseCases = (leaf: Leaf) => {
  const p = leaf.path
  const required = leaf.positionals.filter((x) => x.required)
  const variadic = leaf.positionals.some((x) => x.variadic)
  const filled = leaf.positionals.map((x) => x.name)
  const cases = [{ id: 'unknown-flag', argv: [...p, '--definitely-not-a-flag'] }]
  if (required.length) cases.push({ id: 'missing-required-positional', argv: [...p, ...required.slice(0, -1).map((x) => x.name)] })
  if (!variadic) cases.push({ id: 'too-many-positionals', argv: [...p, ...filled, 'one-too-many'] })
  if (leaf.hasSubcommands) cases.push({ id: 'unknown-subcommand', argv: [...p, 'nosuchsub'] })
  return cases
}
for (const leaf of leaves) {
  for (const c of parseCases(leaf)) {
    const r = await minOf(() => {
      const t = performance.now()
      const parsed = parseCLIArguments(c.argv, leaf.program, meta)
      return { ms: performance.now() - t, parsed }
    })
    // Mirror cli-runner.ts:493-502 — an unknown command prints the whole help
    // and exits 1, anything else prints an indented `Errors:` block. Capturing
    // the raw message strings would not be what a user sees.
    const errs: string[] = r.parsed.errors ?? []
    const warns: string[] = r.parsed.warnings ?? []
    const unknownCommand = errs.some((e) =>
      e.startsWith('Unknown command:') || e.startsWith('Command not found:') || e.startsWith('Missing subcommand:'))
    const text = [
      ...warns.map((w) => `Warning: ${w}`),
      ...(errs.length
        ? unknownCommand
          ? [generateCommandHelp(leaf.program, meta, leaf.path)]
          : ['Errors:', ...errs.map((e) => `  ${e}`)]
        : []),
    ].join('\n')
    record({ tier: 'parse', program: leaf.program, command: leaf.path.join(' '), case: c.id, observed: false }, r.ms, text,
      { errorCount: errs.length, exitCode: errs.length ? 1 : 0, presentedAs: errs.length ? (unknownCommand ? 'help+exit1' : 'errors-block') : 'none' })
  }
}

/* ---------------- tier: render (real renderer, synthesized payload) ---------------- */
let withSchema = 0
for (const leaf of leaves) {
  const render = programs[leaf.program]?.renderers?.[leaf.id] ?? programs[leaf.program]?.defaultRenderer
  const schema = schemaFor(leaf.funcId)
  if (!render || !schema) continue
  withSchema++
  for (const mode of ['minimal', 'typical', 'many', 'extremes'] as Mode[]) {
    const holes: string[] = []
    const data = gen(schema, 'value', mode, 0, holes)
    const r = await minOf(() => capture(render, data))
    record(
      { tier: 'render', program: leaf.program, command: leaf.path.join(' '), case: mode, observed: false },
      r.ms, r.output,
      {
        renderer: leaf.render ?? '(program default)',
        hasRenderer: !!programs[leaf.program]?.renderers?.[leaf.id],
        threw: r.threw, payload: data,
        // Fields the schema left untyped: anything built for them is invented.
        synthesisHoles: [...new Set(holes)],
      }
    )
  }
}

/* ---------------- tier: spawn (real process, opt-in — this is the only slow part) ---------------- */
const baselines: any = {}
if (process.env.SPAWN) {
  const abs = join(process.cwd(), BIN)
  const empty = mkdtempSync(join(tmpdir(), 'pikku-probe-'))
  const wiring = [join(process.cwd(), 'dist/.pikku/cli/pikku-cli.gen.js'), join(process.cwd(), OUT, 'cli/pikku-cli.gen.js')].find(existsSync) ?? ''
  const spawn = (argv: string[], opts: any = {}) => async () => {
    const t = performance.now()
    try {
      const r = await run('node', argv, { timeout: 30000, env: { ...process.env, FORCE_COLOR: '3', COLUMNS: '100' }, ...opts })
      return { ms: performance.now() - t, output: r.stdout + r.stderr, exitCode: 0 }
    } catch (e: any) {
      return { ms: performance.now() - t, output: (e.stdout ?? '') + (e.stderr ?? ''), exitCode: e.code ?? 1 }
    }
  }
  const subjects = [
    { key: '__runtimeBoot', fn: spawn(['-e', '']) },
    { key: '__importGraph', fn: spawn(['-e', `await import(${JSON.stringify(wiring)})`]) },
    { key: '__helpEmptyDir', fn: spawn([abs, '--help'], { cwd: empty }) },
    ...leaves.map((l) => ({ key: l.path.join(' '), leaf: l, fn: spawn([abs, ...l.path, '--help']) })),
  ]
  const seen = new Map<string, any[]>(subjects.map((s) => [s.key, []]))
  // Shuffled per round: a fixed order lets whichever subject runs first absorb
  // the cold page cache every time, biasing it slow by ~100ms.
  const shuffle = <T>(a: T[]) => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]] } return c }
  for (let round = 0; round < REPS; round++) {
    for (const s of shuffle(subjects)) seen.get(s.key)!.push(await s.fn())
    process.stderr.write(`spawn round ${round + 1}/${REPS}\n`)
  }
  const best = (k: string) => seen.get(k)!.reduce((a, b) => (a.ms < b.ms ? a : b))
  for (const k of ['__runtimeBoot', '__importGraph', '__helpEmptyDir']) baselines[k.slice(2)] = +best(k).ms.toFixed(1)
  baselines.helpEmptyDirExitCode = best('__helpEmptyDir').exitCode
  for (const s of subjects) {
    if (!('leaf' in s)) continue
    const b = best(s.key)
    record({ tier: 'spawn', program: (s as any).leaf.program, command: s.key, case: 'help', observed: true },
      b.ms, b.output, { exitCode: b.exitCode, overImportGraphMs: +(b.ms - baselines.importGraph).toFixed(1) })
  }
}

/* ---------------- write ---------------- */
mkdirSync(RESULTS, { recursive: true })
writeFileSync(join(RESULTS, 'outputs.ndjson'), outputs.map((r) => JSON.stringify(r)).join('\n') + '\n')
writeFileSync(join(RESULTS, 'timings.ndjson'), timings.map((r) => JSON.stringify(r)).join('\n') + '\n')

const byTier = (t: string) => timings.filter((r) => r.tier === t)
const pct = (rows: any[], p: number) => {
  if (!rows.length) return null
  const v = rows.map((r) => r.ms).sort((a, b) => a - b)
  return +v[Math.min(v.length - 1, Math.floor(v.length * p))].toFixed(3)
}
const summary = {
  generatedAt: new Date().toISOString(),
  outDir: OUT, bin: BIN, reps: REPS,
  commands: { total: leaves.length, withRenderer: leaves.filter((l) => programs[l.program]?.renderers?.[l.id]).length, withOutputSchema: withSchema },
  captures: outputs.length,
  tiers: Object.fromEntries(['help', 'parse', 'render', 'spawn'].map((t) => [t, {
    captures: byTier(t).length, p50Ms: pct(byTier(t), 0.5), p95Ms: pct(byTier(t), 0.95),
    totalMs: +byTier(t).reduce((a, r) => a + r.ms, 0).toFixed(1),
  }])),
  baselines: process.env.SPAWN ? baselines : '(set SPAWN=1)',
}
writeFileSync(join(RESULTS, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
