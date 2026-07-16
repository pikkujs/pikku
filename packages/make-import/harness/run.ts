/**
 * Coverage harness for @pikku/make-import.
 *
 * Runs a corpus of Make blueprint JSON through parse → codegen and classifies
 * each as clean / partial / failed / skipped.
 *
 *   yarn harness --dir <path>    # a folder of .json blueprints
 *   yarn harness --limit 100
 *
 * Corpus provenance: public GitHub blueprints + `integromat/make-skills` (MIT,
 * published by Make). Nothing here touches Make's service.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { generateWorkflowFromN8n } from '../../n8n-import/src/codegen.js'
import { parseMake, UnsupportedBlueprintError } from '../src/parse-make.js'
import { splitModule, BUILTIN_NAMESPACES } from '../src/types.js'

type Outcome = 'clean' | 'partial' | 'failed' | 'skipped'

interface Row {
  file: string
  outcome: Outcome
  modules: number
  stubs: number
  leaks?: number
  reason?: string
  warnings: string[]
}

const args = process.argv.slice(2)
const argOf = (flag: string) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
const dir = resolve(argOf('--dir') ?? './corpus')
const limit = Number(argOf('--limit') ?? '100000')

function collect(d: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) out.push(...collect(p))
    else if (e.endsWith('.json')) out.push(p)
  }
  return out
}

const files = collect(dir).slice(0, limit)
const rows: Row[] = []
const moduleFreq = new Map<string, number>()
const warnFreq = new Map<string, number>()
let leakTotal = 0
let todoTotal = 0

for (const file of files) {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    continue // not JSON — not our corpus
  }

  let parsed
  try {
    parsed = parseMake(raw, 'workflow')
  } catch (e) {
    // Not a Make blueprint at all → not a failure, it's not in scope.
    if (e instanceof UnsupportedBlueprintError) continue
    rows.push({
      file,
      outcome: 'failed',
      modules: 0,
      stubs: 0,
      reason: `parse: ${(e as Error).message}`,
      warnings: [],
    })
    continue
  }

  for (const m of parsed.modulesSeen) moduleFreq.set(m, (moduleFreq.get(m) ?? 0) + 1)
  for (const w of parsed.warnings) warnFreq.set(w.kind, (warnFreq.get(w.kind) ?? 0) + 1)

  try {
    const res = generateWorkflowFromN8n(parsed, { rpcPrefix: 'make' })
    if (res.diagnostics.some((d) => d.type === 'error')) {
      rows.push({
        file,
        outcome: 'skipped',
        modules: parsed.nodes.length,
        stubs: 0,
        reason: res.diagnostics[0]?.message,
        warnings: parsed.warnings.map((w) => w.kind),
      })
      continue
    }
    const stubs = res.manifest.length
    const emitted = Object.keys(res.files).length

    // Ground truth on lowering: an `={{ … }}` surviving into a GRAPH file means a
    // ref we failed to lower and leaked as raw text. (Stub `.function.ts` files and
    // the integrations manifest legitimately carry the original parameters.)
    // Only LIVE code counts. `// TODO(n8n expr): …` comments are codegen's designed
    // transform path — the expression isn't declaratively expressible, so it is
    // preserved verbatim for a human. That's correct degradation, not a leak.
    const graphLines = Object.entries(res.files)
      .filter(([p]) => p.endsWith('.graph.ts'))
      .flatMap(([, c]) => c.split('\n'))
      .filter((l) => !l.trim().startsWith('//'))
    const leaks = graphLines.join('\n').match(/=\{\{/g)?.length ?? 0
    if (leaks) leakTotal += leaks
    const todos = Object.entries(res.files)
      .filter(([p]) => p.endsWith('.graph.ts'))
      .flatMap(([, c]) => c.split('\n'))
      .filter((l) => l.includes('TODO(n8n expr)')).length
    todoTotal += todos

    rows.push({
      file,
      outcome: emitted === 0 ? 'failed' : stubs > 0 ? 'partial' : 'clean',
      modules: parsed.nodes.length,
      stubs,
      leaks,
      warnings: parsed.warnings.map((w) => w.kind),
    })
  } catch (e) {
    rows.push({
      file,
      outcome: 'failed',
      modules: parsed.nodes.length,
      stubs: 0,
      reason: `codegen: ${(e as Error).message}`,
      warnings: parsed.warnings.map((w) => w.kind),
    })
  }
}

const by = (o: Outcome) => rows.filter((r) => r.outcome === o).length
const total = rows.length

console.log(`\n=== @pikku/make-import harness ===`)
console.log(`corpus dir     : ${dir}`)
console.log(`files scanned  : ${files.length}`)
console.log(`real blueprints: ${total}\n`)
for (const o of ['clean', 'partial', 'failed', 'skipped'] as Outcome[]) {
  const n = by(o)
  if (total) console.log(`${o.padEnd(8)} ${String(n).padStart(4)}  ${((100 * n) / total).toFixed(0)}%`)
}

const failures = rows.filter((r) => r.outcome === 'failed')
if (failures.length) {
  console.log(`\n--- failures (${failures.length}) ---`)
  const reasons = new Map<string, number>()
  for (const f of failures) {
    const key = (f.reason ?? 'unknown').slice(0, 90)
    reasons.set(key, (reasons.get(key) ?? 0) + 1)
  }
  for (const [r, c] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`${String(c).padStart(4)}  ${r}`)
  }
}

console.log(`\nrefs LEAKED into live graph code : ${leakTotal}`)
console.log(`transforms preserved as TODO     : ${todoTotal}`)
console.log(`\n--- lossiness warnings ---`)
for (const [k, c] of [...warnFreq].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(c).padStart(5)}  ${k}`)
}

const builtinMods = [...moduleFreq].filter(([m]) => BUILTIN_NAMESPACES.has(splitModule(m).app))
const intMods = [...moduleFreq].filter(([m]) => !BUILTIN_NAMESPACES.has(splitModule(m).app))
console.log(`\n--- module surface ---`)
console.log(`distinct modules   : ${moduleFreq.size}`)
console.log(`  builtin/primitive: ${builtinMods.length} (${builtinMods.reduce((a, [, c]) => a + c, 0)} uses)`)
console.log(`  integration      : ${intMods.length} (${intMods.reduce((a, [, c]) => a + c, 0)} uses)`)
console.log(`\n--- top builtin modules (native-map targets) ---`)
for (const [m, c] of builtinMods.sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`${String(c).padStart(5)}  ${m}`)
}

writeFileSync(
  join(process.cwd(), 'harness-report.json'),
  JSON.stringify(
    { total, clean: by('clean'), partial: by('partial'), failed: by('failed'), rows },
    null,
    2
  )
)
console.log(`\nwrote harness-report.json`)
