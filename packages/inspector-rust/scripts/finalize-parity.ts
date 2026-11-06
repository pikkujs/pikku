#!/usr/bin/env bun
/**
 * Finalize-only parity: for every Pikku project, take Go's PRE-finalize state
 * (`<goBin> --stdin --no-finalize`), feed the same bytes to `finalize --stdin`
 * of both binaries, and compare the two outputs byte-for-byte. Go's finalize of
 * that state is the oracle; the Rust analysis does not take part, so this runs
 * independently of the visitor ports.
 *
 *   bun finalize-parity.ts <goBin> <rsBin> [--projects a,b*] [--out dir] [--schemas]
 *                          [--jobs N] [--timeout SECONDS] [--cap N] [--no-cache]
 *
 * <goBin> must understand `--no-finalize` (packages/inspector-go, commit
 * "--no-finalize returns analysis-only (pre-finalize) state").
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  NORMALISATIONS,
  buildRequest,
  cachedRun,
  discoverProjects,
  filterProjects,
  firstByteDiff,
  normalise,
  parseJson,
  pool,
  projectName,
  runBinary,
  sh,
  structuralDiff,
  type KeyReport,
} from './lib.ts'

const DEFAULT_FINALIZE_OUT =
  '/tmp/claude-1000/-home-dev-pikku-pikku/477e9738-67aa-4b05-8fa0-8275aa107d70/scratchpad/finalize-parity'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    projects: { type: 'string' },
    out: { type: 'string', default: DEFAULT_FINALIZE_OUT },
    schemas: { type: 'boolean', default: false },
    jobs: { type: 'string', default: '4' },
    timeout: { type: 'string', default: '300' },
    cap: { type: 'string', default: '5' },
    'no-cache': { type: 'boolean', default: false },
  },
})
const [goBin, rsBin] = positionals
if (!goBin || !rsBin) {
  console.error('usage: finalize-parity.ts <goBin> <rsBin> [--projects list] [--out dir] [--schemas] [--jobs N] [--timeout s] [--cap N] [--no-cache]')
  process.exit(2)
}
const out = values.out!
const timeoutMs = Number(values.timeout) * 1000
const cap = Number(values.cap)
const cacheDir = values['no-cache'] ? undefined : join(out, 'go-cache')
mkdirSync(join(out, 'diffs'), { recursive: true })
mkdirSync(join(out, 'rust-output'), { recursive: true })
mkdirSync(join(out, 'go-output'), { recursive: true })

const projects = filterProjects(discoverProjects(), values.projects)
console.error(`projects selected: ${projects.length}, schemas: ${values.schemas}`)

type Status = 'identical' | 'different' | 'pre-finalize-failed'

interface ProjectResult {
  project: string
  status: Status
  note?: string
  goWallMs: number
  rsWallMs: number
  byteDiff: ReturnType<typeof firstByteDiff>
  keys: Record<string, KeyReport>
  rsStderrHead?: string
}

const safe = (p: string) => p.replace(/\//g, '__')

const run = async (dir: string): Promise<ProjectResult> => {
  const project = projectName(dir)
  const request = await buildRequest(dir, values.schemas!)
  const pre = await cachedRun({ bin: goBin, args: ['--stdin', '--no-finalize'], stdin: request, timeoutMs, cacheDir })
  const j = parseJson(pre.stdout)
  if (!j?.state || j.error !== undefined)
    return { project, status: 'pre-finalize-failed', note: j?.error ? String(j.error).split('\n')[0] : `exit ${pre.exitCode}: ${pre.stderr.slice(0, 160)}`, goWallMs: pre.wallMs, rsWallMs: 0, byteDiff: null, keys: {} }
  const stdin = JSON.stringify({ state: j.state, diagnostics: j.diagnostics, options: JSON.parse(request).options })
  writeFileSync(join(out, 'diffs', `${safe(project)}.finalize-input.json`), stdin)
  const args = ['finalize', '--stdin']
  const [go, rs] = await Promise.all([
    cachedRun({ bin: goBin, args, stdin, timeoutMs, cacheDir }),
    runBinary(rsBin, args, stdin, timeoutMs),
  ])
  writeFileSync(join(out, 'go-output', `${safe(project)}.json`), go.stdout)
  writeFileSync(join(out, 'rust-output', `${safe(project)}.json`), rs.stdout)
  const goN = normalise(go.stdout)
  const rsN = normalise(rs.stdout)
  const byteDiff = firstByteDiff(goN.text, rsN.text)
  const rsStderrHead = rs.stderr.trim().split('\n').slice(0, 3).join('\n') || undefined
  const base = { project, goWallMs: go.wallMs, rsWallMs: rs.wallMs, rsStderrHead }
  if (!byteDiff) return { ...base, status: 'identical', byteDiff, keys: structuralDiff(parseJson(goN.text), parseJson(goN.text), cap) }
  const goJson = parseJson(goN.text)
  const rsJson = parseJson(rsN.text)
  const keys = rsJson
    ? structuralDiff(goJson, rsJson, cap)
    : { '<response>': { status: 'different' as const, leafDiffs: 1, first: [{ path: '', go: 'JSON', rs: `not JSON (exit ${rs.exitCode}) ${rs.stderr.slice(0, 160)}` }] } }
  return { ...base, status: 'different', byteDiff, keys }
}

let done = 0
const results = await pool(projects, Number(values.jobs), async (dir) => {
  const r = await run(dir)
  console.error(`[${++done}/${projects.length}] ${r.project}: ${r.status}${r.status === 'different' ? ` (${Object.values(r.keys).filter((k) => k.status !== 'identical').length} keys differ)` : ''}`)
  writeFileSync(join(out, 'diffs', `${safe(r.project)}.json`), JSON.stringify(r, null, 2))
  return r
})

const ok = results.filter((r) => r.status !== 'pre-finalize-failed')
let keysTotal = 0
let keysIdentical = 0
for (const r of ok) for (const k of Object.values(r.keys)) { keysTotal++; if (k.status === 'identical') keysIdentical++ }
const identical = results.filter((r) => r.status === 'identical').length
const totals = `keys identical: ${keysIdentical} of ${keysTotal} across ${ok.length} projects`
const allKeys = [...new Set(ok.flatMap((r) => Object.keys(r.keys)))].sort()
const lines: string[] = ['# Finalize parity scoreboard', '', `**${totals}**  `, `projects byte-identical: ${identical} of ${results.length} (schemas ${values.schemas ? 'on' : 'off'})`, '', `Go: \`${goBin}\`  Rust: \`${rsBin}\``, '', 'Normalised before comparing: ' + NORMALISATIONS.join('; '), '']
lines.push('## Per key', '', '| key | identical | different | missing in Rust | leaf diffs |', '|---|---|---|---|---|')
for (const key of allKeys) {
  const rs = ok.map((r) => r.keys[key]).filter(Boolean)
  const c = (s: string) => rs.filter((k) => k.status === s).length
  lines.push(`| ${key} | ${c('identical')}/${rs.length} | ${c('different')} | ${c('missing-in-rust')} | ${rs.reduce((a, k) => a + (k.status === 'different' ? k.leafDiffs : 0), 0)} |`)
}
lines.push('', '## Per project', '', '| project | status | keys ok | rs time | go time | differing keys |', '|---|---|---|---|---|---|')
for (const r of results) {
  const ks = Object.entries(r.keys)
  const bad = ks.filter(([, k]) => k.status !== 'identical').map(([n]) => n.replace('state.', ''))
  lines.push(`| ${r.project} | ${r.status}${r.note ? ` (${r.note})` : ''} | ${ks.length ? `${ks.length - bad.length}/${ks.length}` : '-'} | ${sh(r.rsWallMs)} | ${sh(r.goWallMs)} | ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? ` +${bad.length - 6}` : ''} |`)
}
const diffs = results.filter((r) => r.status === 'different')
if (diffs.length) {
  lines.push('', `## First differences (up to ${cap} leaf paths per key, first 3 differing keys per project)`, '')
  for (const r of diffs) {
    lines.push(`### ${r.project}`)
    if (r.byteDiff) lines.push(`first differing byte: offset ${r.byteDiff.offset} (go ${r.byteDiff.goLength} B, rust ${r.byteDiff.rsLength} B)`, '```', `go: ${JSON.stringify(r.byteDiff.goContext)}`, `rs: ${JSON.stringify(r.byteDiff.rsContext)}`, '```')
    if (r.rsStderrHead) lines.push('rust stderr:', '```', r.rsStderrHead, '```')
    for (const [name, k] of Object.entries(r.keys).filter(([, k]) => k.status !== 'identical').slice(0, 3)) {
      lines.push(`- \`${name}\` ${k.status}${k.orderOnly ? ' (key order only)' : ''}, ${k.leafDiffs} leaf diffs`)
      for (const d of k.first) lines.push(`  - \`${d.path}\` go=${d.go} rs=${d.rs}`)
    }
    lines.push('')
  }
}
writeFileSync(join(out, 'summary.md'), lines.join('\n'))
console.log(totals)
console.log(`projects byte-identical: ${identical} of ${results.length}; pre-finalize failures: ${results.length - ok.length}`)
console.log(`summary: ${join(out, 'summary.md')}`)
process.exit(identical === results.length ? 0 : 1)
