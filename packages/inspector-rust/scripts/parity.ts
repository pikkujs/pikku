#!/usr/bin/env bun
/**
 * Parity harness: runs the Go oracle and the Rust inspector on every Pikku
 * project and compares the output byte-for-byte. See README.md.
 *
 *   bun parity.ts <goBin> <rsBin> [--projects a,b*] [--out dir] [--schemas]
 *                 [--finalize] [--jobs N] [--timeout SECONDS] [--cap N] [--no-cache]
 *                 [--captured <generate-parity out dir>]
 *
 * --captured replays the requests the real CLI sent (recorded by generate-parity.ts under
 * <dir>/captured/<project>/<cold|warm>/go/) instead of the synthetic projectInput request.
 * The requests name files of the project checkout, so replay them against the same
 * checkout (generate-parity already does this after each Go run, while the generated
 * scaffold files still exist; missing files make both engines fail alike).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  DEFAULT_OUT,
  NORMALISATIONS,
  buildRequest,
  cachedRun,
  discoverProjects,
  discoverTracked,
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
  type Mode,
  type RunResult,
} from './lib.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    projects: { type: 'string' },
    out: { type: 'string', default: DEFAULT_OUT },
    schemas: { type: 'boolean', default: false },
    finalize: { type: 'boolean', default: false },
    mode: { type: 'string' },
    jobs: { type: 'string', default: '4' },
    timeout: { type: 'string', default: '300' },
    cap: { type: 'string', default: '5' },
    'no-cache': { type: 'boolean', default: false },
    captured: { type: 'string' },
    corpus: { type: 'string', default: 'default' },
  },
})
const [goBin, rsBin] = positionals
if (!goBin || !rsBin) {
  console.error(
    'usage: parity.ts <goBin> <rsBin> [--projects list] [--out dir] [--schemas] [--finalize] [--jobs N] [--timeout s] [--cap N] [--no-cache]'
  )
  process.exit(2)
}
const mode: Mode = values.finalize || values.mode === 'finalize' ? 'finalize' : 'inspect'
const out = values.out!
const timeoutMs = Number(values.timeout) * 1000
const cap = Number(values.cap)
const jobs = Number(values.jobs)
const cacheDir = values['no-cache'] ? undefined : join(out, 'go-cache')
mkdirSync(join(out, 'diffs'), { recursive: true })
mkdirSync(join(out, 'rust-output'), { recursive: true })

const all = values.corpus === 'tracked' ? discoverTracked() : discoverProjects()
const projects = filterProjects(all, values.projects)
console.error(`projects discovered: ${all.length}, selected: ${projects.length}, mode: ${mode}, schemas: ${values.schemas}`)

type Status = 'identical' | 'different' | 'expected-failure-match' | 'expected-failure-mismatch'

interface ProjectResult {
  project: string
  status: Status
  goExit: number | null
  rsExit: number | null
  goError?: string
  goWallMs: number
  rsWallMs: number
  goRssKb: number | null
  rsRssKb: number | null
  goCached: boolean
  rsTimedOut: boolean
  normalisationCounts: { go: Record<string, number>; rs: Record<string, number> }
  byteDiff: ReturnType<typeof firstByteDiff>
  keys: Record<string, KeyReport>
  rsStderrHead?: string
}

const goFailure = (r: RunResult): string | undefined => {
  if (r.timedOut) return `timeout`
  if (r.exitCode !== 0) return `exit ${r.exitCode}: ${r.stderr.trim().split('\n')[0]}`
  const j = parseJson(r.stdout)
  if (!j) return 'stdout is not JSON'
  if (j.error !== undefined) return `response.error: ${String(j.error).split('\n')[0]}`
  return undefined
}

interface Case {
  label: string
  args: string[]
  request: string
}

/** One synthetic request per project, or every request the real CLI sent for it. */
const casesOf = async (dir: string): Promise<Case[]> => {
  const project = projectName(dir)
  if (!values.captured)
    return [{ label: project, args: ['--stdin'], request: await buildRequest(dir, values.schemas!) }]
  const found: Case[] = []
  for (const phase of ['cold', 'warm']) {
    const capDir = join(values.captured, 'captured', project, phase, 'go')
    if (!existsSync(capDir)) continue
    for (const f of readdirSync(capDir).filter((f) => f.endsWith('.in')).sort())
      found.push({
        label: `${project}#${phase}-${f.replace(/\.in$/, '')}`,
        args: readFileSync(join(capDir, f.replace(/\.in$/, '.args')), 'utf8').split('\n').filter(Boolean),
        request: readFileSync(join(capDir, f), 'utf8'),
      })
  }
  return found
}

const run = async ({ label: project, args: initialArgs, request }: Case): Promise<ProjectResult> => {
  writeFileSync(join(out, 'diffs', `${project.replace(/[\/#]/g, '__')}.request.json`), request)
  let args = initialArgs
  let stdin = request
  if (mode === 'finalize') {
    const base = await cachedRun({ bin: goBin, args, stdin: request, timeoutMs, cacheDir })
    const j = parseJson(base.stdout)
    if (!j?.state)
      return failResult(project, base, 'Go inspect produced no state to refinalize')
    args = ['finalize', '--stdin']
    stdin = JSON.stringify({
      state: j.state,
      diagnostics: j.diagnostics,
      options: JSON.parse(request).options,
    })
  }
  const [go, rs] = await Promise.all([
    cachedRun({ bin: goBin, args, stdin, timeoutMs, cacheDir }),
    runBinary(rsBin, args, stdin, timeoutMs),
  ])
  writeFileSync(join(out, 'rust-output', `${project.replace(/[\/#]/g, '__')}.json`), rs.stdout)
  const goN = normalise(go.stdout)
  const rsN = normalise(rs.stdout)
  const base = {
    project,
    goExit: go.exitCode,
    rsExit: rs.exitCode,
    goWallMs: go.wallMs,
    rsWallMs: rs.wallMs,
    goRssKb: go.peakRssKb,
    rsRssKb: rs.peakRssKb,
    goCached: go.cached,
    rsTimedOut: rs.timedOut,
    normalisationCounts: { go: goN.counts, rs: rsN.counts },
    rsStderrHead: rs.stderr.trim().split('\n').slice(0, 3).join('\n') || undefined,
  }
  const byteDiff = firstByteDiff(goN.text, rsN.text)
  const goError = goFailure(go)
  if (goError) {
    const same =
      go.exitCode === rs.exitCode &&
      goN.text === rsN.text &&
      normalise(go.stderr).text === normalise(rs.stderr).text
    return {
      ...base,
      status: same ? 'expected-failure-match' : 'expected-failure-mismatch',
      goError,
      byteDiff,
      keys: {},
    }
  }
  if (!byteDiff) return { ...base, status: 'identical', byteDiff, keys: structuralDiff(parseJson(goN.text), parseJson(goN.text), cap) }
  const rsJson = parseJson(rsN.text)
  const keys = rsJson
    ? structuralDiff(parseJson(goN.text), rsJson, cap)
    : { '<response>': { status: 'different' as const, leafDiffs: 1, first: [{ path: '', go: 'JSON', rs: `not JSON (exit ${rs.exitCode}) ${rs.stderr.slice(0, 120)}` }] } }
  return { ...base, status: 'different', byteDiff, keys }
}

const failResult = (project: string, r: RunResult, why: string): ProjectResult => ({
  project, status: 'expected-failure-mismatch', goExit: r.exitCode, rsExit: null, goError: why,
  goWallMs: r.wallMs, rsWallMs: 0, goRssKb: r.peakRssKb, rsRssKb: null, goCached: false, rsTimedOut: false,
  normalisationCounts: { go: {}, rs: {} }, byteDiff: null, keys: {},
})

let done = 0
const cases = (await Promise.all(projects.map(casesOf))).flat()
console.error(`cases: ${cases.length}`)
const results = await pool(cases, jobs, async (c) => {
  const r = await run(c)
  console.error(`[${++done}/${cases.length}] ${r.project}: ${r.status}${r.status === 'different' ? ` (${Object.values(r.keys).filter((k) => k.status !== 'identical').length} keys differ)` : ''}`)
  const file = join(out, 'diffs', `${r.project.replace(/[\/#]/g, '__')}.json`)
  writeFileSync(file, JSON.stringify(r, null, 2))
  return r
})

// ------------------------------------------------------------- scoreboard
const ok = results.filter((r) => r.status === 'identical' || r.status === 'different')
const failures = results.filter((r) => r.status.startsWith('expected-failure'))
const allKeys = [...new Set(ok.flatMap((r) => Object.keys(r.keys)))].sort()
let keysTotal = 0
let keysIdentical = 0
for (const r of ok) for (const k of Object.values(r.keys)) { keysTotal++; if (k.status === 'identical') keysIdentical++ }
const identicalProjects = results.filter((r) => r.status === 'identical' || r.status === 'expected-failure-match').length
const totals = `keys identical: ${keysIdentical} of ${keysTotal} across ${ok.length} projects`
const lines: string[] = []
lines.push(`# Parity scoreboard`, '')
lines.push(`**${totals}**  `)
lines.push(`projects byte-identical: ${identicalProjects} of ${results.length} (mode ${mode}, schemas ${values.schemas ? 'on' : 'off'}, ${failures.length} Go-failure projects)`, '')
lines.push(`Go: \`${goBin}\`  Rust: \`${rsBin}\``, '')
lines.push('Normalised before comparing: ' + NORMALISATIONS.join('; '), '')
lines.push('## Per state key', '', '| key | identical | different | missing in Rust | leaf diffs |', '|---|---|---|---|---|')
for (const key of allKeys) {
  const rs = ok.map((r) => r.keys[key]).filter(Boolean)
  const c = (s: string) => rs.filter((k) => k.status === s).length
  lines.push(`| ${key} | ${c("identical")}/${rs.length} | ${c('different')} | ${c('missing-in-rust')} | ${rs.reduce((a, k) => a + (k.status === 'different' ? k.leafDiffs : 0), 0)} |`)
}
lines.push('', '## Per project', '', '| project | status | keys ok | rs time | go time | rs RSS MB | differing keys |', '|---|---|---|---|---|---|---|')
for (const r of results) {
  const ks = Object.entries(r.keys)
  const bad = ks.filter(([, k]) => k.status !== 'identical').map(([n]) => n.replace('state.', ''))
  lines.push(`| ${r.project} | ${r.status}${r.rsTimedOut ? ' (rust timeout)' : ''} | ${ks.length ? `${ks.length - bad.length}/${ks.length}` : '-'} | ${sh(r.rsWallMs)} | ${sh(r.goWallMs)} | ${r.rsRssKb ? Math.round(r.rsRssKb / 1024) : '-'} | ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? ` +${bad.length - 6}` : ''} |`)
}
lines.push('', '## Matrix (rows projects, columns state keys; + identical, X different/missing, . n/a)', '', '```')
lines.push(allKeys.map((k, i) => `${String(i).padStart(2)} ${k}`).join('\n'), '')
for (const r of ok) lines.push(allKeys.map((k) => (r.keys[k] ? (r.keys[k].status === 'identical' ? '+' : 'X') : '.')).join('') + '  ' + r.project)
lines.push('```')
if (failures.length) {
  lines.push('', '## Projects where Go fails (expected-failure)', '')
  for (const r of failures) lines.push(`- ${r.project}: ${r.status}; Go: ${r.goError}`)
}
const diffs = results.filter((r) => r.status === 'different' || r.status === 'expected-failure-mismatch')
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
writeFileSync(join(out, 'results.json'), JSON.stringify({ totals: { keysIdentical, keysTotal, projects: ok.length, identicalProjects, allProjects: results.length }, mode, schemas: values.schemas, normalisations: NORMALISATIONS, results }, null, 2))
const goTotal = results.reduce((a, r) => a + r.goWallMs, 0)
const rsTotal = results.reduce((a, r) => a + r.rsWallMs, 0)
console.log(totals)
console.log(`projects byte-identical: ${identicalProjects} of ${results.length}; cumulative wall go ${sh(goTotal)} rust ${sh(rsTotal)}`)
console.log(`summary: ${join(out, 'summary.md')}`)
process.exit(identicalProjects === results.length ? 0 : 1)
