#!/usr/bin/env bun
/**
 * Parity of the Go inspector against the TypeScript reference.
 *
 *   bun parity/parity.ts [--project <dir>]... [--bin <path>] [--strict]
 *                        [--json <file>] [--details <n>]
 *
 * Per project with a pikku.config.json under examples/ and templates/ (or
 * each --project), it compares, section by top-level section:
 *   pre          the state analysis hands to finalize (skipped once the
 *                binary finalizes itself)
 *   post         the state after finalize, which is what codegen reads
 *   diagnostics  the logger calls by level, as code + message, in both phases
 * A section the binary does not emit yet is "not ported". A difference an
 * allow-list.json entry covers is "normalized" away or "allowed". Exit status
 * is 1 on any unexpected difference or engine failure (and, with --strict, on
 * any section not ported), and 2 when there is no binary to compare.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getInitialInspectorState,
  serializeInspectorState,
} from '@pikku/inspector'
import {
  deserializeInspectorState,
  finalizeInspectorState,
} from '@pikku/inspector/finalize'
import { findInspectorBinary } from '../src/binary.ts'
import { runInspectorBinary } from '../src/run-binary.ts'
import { createRecordingLogger, replayDiagnostics } from '../src/diagnostics.ts'
import {
  toAnalysisOptions,
  type InspectorGoDiagnostic,
  type InspectorGoOutput,
} from '../src/protocol.ts'
import { projectInput } from './project-input.ts'
import { comparableState, diffPaths } from './comparable.ts'
import { NORMALIZERS } from './normalize.ts'
import { runTypeScript } from './run-ts.ts'
import type { TsRunResult } from './ts-run.ts'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))

type Phase = 'pre' | 'post'
type Status =
  'ok' | 'normalized' | 'allowed' | 'diff' | 'not ported' | 'extra' | 'n/a'

interface AllowEntry {
  id: string
  reason: string
  /** A top-level state key, or `diagnostics.<level>`. */
  section: string
  /** Project paths relative to the repo root; all projects when unset. */
  projects?: string[]
  phases?: Phase[]
  /** A name from NORMALIZERS, applied to both sides before comparing. */
  normalize?: string
  /** Regexes over diff paths; when set, only diffs at matching paths are allowed. */
  paths?: string[]
}

interface SectionResult {
  section: string
  phase: Phase
  status: Status
  details: string[]
  allowedBy?: string
}

interface ProjectResult {
  project: string
  /** The binary failed or broke the protocol. */
  error?: string
  /** The TypeScript reference itself failed, so there is nothing to compare. */
  referenceError?: string
  finalizedByGo?: boolean
  sections: SectionResult[]
}

// ---- arguments ----

const args = process.argv.slice(2)
const values = (name: string) =>
  args.flatMap((arg, i) => (arg === name && args[i + 1] ? [args[i + 1]] : []))
const strict = args.includes('--strict')
const detailLimit = Number(values('--details')[0] ?? 5)
const jsonOut = values('--json')[0]

const discoverProjects = (): string[] =>
  ['examples', 'templates'].flatMap((group) =>
    readdirSync(join(REPO, group), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(REPO, group, entry.name, 'pikku.config.json'))
      )
      .map((entry) => join(REPO, group, entry.name))
      .sort()
  )

const projects = values('--project').length
  ? values('--project').map((p) => resolve(p))
  : discoverProjects()

let binary: string
try {
  binary = values('--bin')[0] ?? findInspectorBinary()
} catch (error: any) {
  console.error(`parity: ${error.message}`)
  process.exit(2)
}

const allowList: AllowEntry[] = JSON.parse(
  readFileSync(new URL('./allow-list.json', import.meta.url), 'utf8')
)
const usedAllowEntries = new Set<string>()

const allowEntriesFor = (project: string, phase: Phase, section: string) =>
  allowList.filter(
    (entry) =>
      entry.section === section &&
      (!entry.phases || entry.phases.includes(phase)) &&
      (!entry.projects || entry.projects.includes(project))
  )

// ---- comparison ----

const compareSection = (
  project: string,
  phase: Phase,
  section: string,
  ts: unknown,
  go: unknown
): SectionResult => {
  if (diffPaths(ts, go, 1).length === 0) {
    return { section, phase, status: 'ok', details: [] }
  }
  const entries = allowEntriesFor(project, phase, section)
  let a = ts
  let b = go
  let normalizedBy: string | undefined
  for (const entry of entries) {
    if (!entry.normalize) continue
    const normalize = NORMALIZERS[entry.normalize]
    if (!normalize) throw new Error(`unknown normalizer ${entry.normalize}`)
    a = normalize(a)
    b = normalize(b)
    normalizedBy = entry.id
  }
  const diffs = diffPaths(a, b, 1000)
  if (diffs.length === 0) {
    usedAllowEntries.add(normalizedBy!)
    return {
      section,
      phase,
      status: 'normalized',
      details: [],
      allowedBy: normalizedBy,
    }
  }
  for (const entry of entries) {
    if (entry.normalize) continue
    const patterns = entry.paths?.map((p) => new RegExp(p))
    if (!patterns || diffs.every((d) => patterns.some((p) => p.test(d)))) {
      usedAllowEntries.add(entry.id)
      return {
        section,
        phase,
        status: 'allowed',
        details: diffs.slice(0, detailLimit),
        allowedBy: entry.id,
      }
    }
  }
  return {
    section,
    phase,
    status: 'diff',
    details: [
      ...diffs.slice(0, detailLimit),
      ...(diffs.length > detailLimit
        ? [`… ${diffs.length - detailLimit} more`]
        : []),
    ],
  }
}

const compareStates = (
  project: string,
  phase: Phase,
  ts: Record<string, unknown>,
  go: Record<string, unknown>,
  emitted: (section: string) => boolean
): SectionResult[] =>
  [...new Set([...Object.keys(ts), ...Object.keys(go)])]
    .sort()
    .map((section) => {
      if (!(section in ts)) {
        return {
          section,
          phase,
          status: 'extra',
          details: ['not in the TypeScript state'],
        }
      }
      if (!emitted(section)) {
        return { section, phase, status: 'not ported', details: [] }
      }
      return compareSection(project, phase, section, ts[section], go[section])
    })

const LEVELS = ['critical', 'error', 'warn', 'info'] as const

const diagnosticLines = (
  diagnostics: InspectorGoDiagnostic[],
  level: string
): string[] =>
  diagnostics
    .filter((d) => d.level === level)
    .map((d) => (d.code ? `[${d.code}] ${d.message}` : d.message))
    .sort()

const compareDiagnostics = (
  project: string,
  phase: Phase,
  ts: InspectorGoDiagnostic[],
  go: InspectorGoDiagnostic[]
): SectionResult[] =>
  LEVELS.map((level) => {
    const section = `diagnostics.${level}`
    const a = diagnosticLines(ts, level)
    const b = diagnosticLines(go, level)
    const result = compareSection(project, phase, section, a, b)
    if (result.status === 'diff') {
      const missing = a.filter((line) => !b.includes(line))
      const extra = b.filter((line) => !a.includes(line))
      result.details = [
        ...missing
          .slice(0, detailLimit)
          .map((l) => `- ts only: ${l.slice(0, 200)}`),
        ...extra
          .slice(0, detailLimit)
          .map((l) => `+ go only: ${l.slice(0, 200)}`),
        ...(missing.length + extra.length > 2 * detailLimit
          ? [`… ${missing.length} ts only, ${extra.length} go only in all`]
          : []),
        ...(missing.length === 0 && extra.length === 0
          ? [`same messages, different counts: ts ${a.length}, go ${b.length}`]
          : []),
      ]
    }
    return result
  })

const withoutDebug = (diagnostics: InspectorGoDiagnostic[]) =>
  diagnostics.filter((d) => d.level !== 'debug')

// ---- per project ----

const runProject = async (projectDir: string): Promise<ProjectResult> => {
  const project = relative(REPO, projectDir) || projectDir
  const result: ProjectResult = { project, sections: [] }
  const { routeFiles, options } = await projectInput(projectDir)

  let ts: TsRunResult
  try {
    ts = runTypeScript('reference', projectDir)
  } catch (error: any) {
    const lines: string[] = error.message.split('\n')
    result.referenceError =
      lines.find((line) => /^\w*Error: /.test(line)) ?? lines[0]
    return result
  }

  let output: InspectorGoOutput
  try {
    output = await runInspectorBinary(binary, {
      routeFiles,
      options: toAnalysisOptions(options),
    })
  } catch (error: any) {
    result.error = error.message
    return result
  }
  result.finalizedByGo = output.finalized
  const sent = new Set(Object.keys(output.state ?? {}))

  const logger = createRecordingLogger()
  replayDiagnostics(logger, output.diagnostics)
  // Sections not sent yet get the empty state's defaults, so finalize runs
  // on what was ported instead of crashing on what was not.
  const state = {
    ...deserializeInspectorState({
      ...serializeInspectorState(
        getInitialInspectorState(options.rootDir ?? projectDir)
      ),
      ...output.state,
    }),
    typesLookup: new Map(),
  }
  if (!output.finalized) {
    result.sections.push(
      ...compareStates(
        project,
        'pre',
        ts.pre as unknown as Record<string, unknown>,
        output.state as unknown as Record<string, unknown>,
        (section) => sent.has(section)
      ),
      ...compareDiagnostics(
        project,
        'pre',
        ts.preDiagnostics,
        withoutDebug(output.diagnostics)
      )
    )
    try {
      await finalizeInspectorState(logger, state, options)
    } catch (error: any) {
      result.error = `finalize threw on the binary's state: ${error.message}`
      return result
    }
  }
  result.sections.push(
    ...compareStates(
      project,
      'post',
      ts.post as Record<string, unknown>,
      comparableState(state) as Record<string, unknown>,
      // A section the binary never sent was filled with its empty default
      // above, so it is still not ported after finalize.
      (section) => sent.has(section) || !(section in (ts.pre as object))
    ),
    ...compareDiagnostics(
      project,
      'post',
      ts.postDiagnostics,
      withoutDebug(logger.diagnostics)
    )
  )
  return result
}

// ---- report ----

const FAILING: Status[] = strict
  ? ['diff', 'extra', 'not ported']
  : ['diff', 'extra']

const cell = (results: SectionResult[], section: string, phase: Phase) =>
  results.find((r) => r.section === section && r.phase === phase)?.status ??
  'n/a'

const printProject = (result: ProjectResult) => {
  console.log(`\n== ${result.project}`)
  if (result.referenceError) {
    console.log(
      `   skipped, the TypeScript reference failed: ${result.referenceError}`
    )
    return
  }
  if (result.error) {
    console.log(`   engine failed: ${result.error}`)
    if (result.sections.length === 0) return
  }
  const sections = [...new Set(result.sections.map((r) => r.section))]
  const width = Math.max(...sections.map((s) => s.length), 7)
  console.log(`   ${'section'.padEnd(width)}  ${'pre'.padEnd(12)}  post`)
  for (const section of sections) {
    const pre = cell(result.sections, section, 'pre')
    const post = cell(result.sections, section, 'post')
    console.log(`   ${section.padEnd(width)}  ${pre.padEnd(12)}  ${post}`)
  }
  for (const r of result.sections) {
    if (r.details.length === 0) continue
    if (r.status !== 'diff' && r.status !== 'allowed') continue
    const by = r.allowedBy ? `: ${r.allowedBy}` : ''
    console.log(`   -- ${r.phase} ${r.section} (${r.status}${by})`)
    for (const line of r.details) console.log(`      ${line}`)
  }
}

console.log(`parity: ${binary} against the TypeScript reference`)
const results: ProjectResult[] = []
for (const projectDir of projects) {
  const result = await runProject(projectDir)
  results.push(result)
  printProject(result)
}

const counts = new Map<Status, number>()
for (const r of results.flatMap((p) => p.sections)) {
  counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
}
const engineFailures = results.filter((p) => p.error).length
const referenceFailures = results.filter((p) => p.referenceError).length
const failures =
  engineFailures +
  results.flatMap((p) => p.sections).filter((r) => FAILING.includes(r.status))
    .length

const summary = [
  ...[...counts].map(([status, n]) => `${n} ${status}`),
  ...(engineFailures ? [`${engineFailures} engine failures`] : []),
  ...(referenceFailures
    ? [`${referenceFailures} skipped (reference failed)`]
    : []),
]
console.log(`\n${results.length} projects: ${summary.join(', ')}`)
for (const entry of allowList) {
  if (!usedAllowEntries.has(entry.id)) {
    console.log(`allow-list entry '${entry.id}' matched nothing`)
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2))
process.exit(failures > 0 ? 1 : 0)
