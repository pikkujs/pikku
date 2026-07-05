// Offsets are mapped through the inline source map rather than line-based
// statement maps: esbuild emits the whole module on one generated line, which
// would collapse every statement onto line 1.
import { fileURLToPath } from 'node:url'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import type {
  CoverageFunctionMeta,
  FunctionCoverageEntry,
  FunctionCoverageReport,
  ScriptCoverage as ScriptCoverageInput,
} from '@pikku/core/services'

export type { ScriptCoverageInput }

const INLINE_SOURCE_MAP =
  /\/\/# sourceMappingURL=data:application\/json[^,]*;base64,([A-Za-z0-9+/=]+)/

function extractInlineSourceMap(source: string) {
  const match = source.match(INLINE_SOURCE_MAP)
  if (!match) return undefined
  try {
    return JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'))
  } catch {
    return undefined
  }
}

function computeLineStarts(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function offsetToGeneratedPosition(offset: number, lineStarts: number[]) {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (lineStarts[mid] <= offset) low = mid
    else high = mid - 1
  }
  return { line: low + 1, column: offset - lineStarts[low] }
}

function normalizeSourcePath(source: string): string {
  if (source.startsWith('file://')) {
    try {
      return fileURLToPath(source)
    } catch {
      return source
    }
  }
  return source
}

async function scriptToLineCoverage(
  script: ScriptCoverageInput,
  getScriptSource: (scriptId: string) => Promise<string>,
  lineHits: Map<string, Map<number, number>>
): Promise<void> {
  let scriptPath: string
  try {
    scriptPath = fileURLToPath(script.url)
  } catch {
    return
  }
  let source: string
  try {
    source = await getScriptSource(script.scriptId)
  } catch {
    return
  }
  const sourcemap = extractInlineSourceMap(source)
  let tracer: TraceMap | undefined
  if (sourcemap) {
    try {
      tracer = new TraceMap(sourcemap)
    } catch {
      tracer = undefined
    }
  }
  const lineStarts = computeLineStarts(source)

  const mapOffset = (
    offset: number
  ): { file: string; line: number } | undefined => {
    const generated = offsetToGeneratedPosition(offset, lineStarts)
    if (!tracer) return { file: scriptPath, line: generated.line }
    const original = originalPositionFor(tracer, generated)
    if (original.source == null || original.line == null) return undefined
    const sourceIndex = tracer.sources.indexOf(original.source)
    const resolved =
      sourceIndex >= 0
        ? (tracer.resolvedSources[sourceIndex] ?? original.source)
        : original.source
    return { file: normalizeSourcePath(resolved), line: original.line }
  }

  const setHits = (file: string, from: number, to: number, count: number) => {
    let hits = lineHits.get(file)
    if (!hits) {
      hits = new Map()
      lineHits.set(file, hits)
    }
    for (let line = from; line <= to; line++) {
      hits.set(line, count)
    }
  }

  for (const fn of script.functions) {
    // Inner ranges overwrite the outer count (V8 override semantics).
    for (const range of fn.ranges) {
      const start = mapOffset(range.startOffset)
      const end = mapOffset(Math.max(range.startOffset, range.endOffset - 1))
      if (!start && !end) continue
      const file = (start ?? end)!.file
      const from = start?.line ?? end!.line
      const to = end && end.file === file ? Math.max(end.line, from) : from
      setHits(file, from, to, range.count)
    }
  }
}

export async function mapPreciseCoverage(
  scripts: ScriptCoverageInput[],
  getScriptSource: (scriptId: string) => Promise<string>,
  functionsMeta: Record<string, CoverageFunctionMeta>
): Promise<FunctionCoverageReport> {
  const lineHits = new Map<string, Map<number, number>>()
  for (const script of scripts) {
    await scriptToLineCoverage(script, getScriptSource, lineHits)
  }
  return mapLineHitsToReport(lineHits, functionsMeta)
}

export function mapLineHitsToReport(
  lineHits: Map<string, Map<number, number>>,
  functionsMeta: Record<string, CoverageFunctionMeta>
): FunctionCoverageReport {
  const functions: FunctionCoverageEntry[] = Object.values(functionsMeta)
    .filter((m) => m.sourceFile && !m.sourceFile.endsWith('.gen.ts'))
    .map((m) => {
      const hits = lineHits.get(m.bodySourceFile ?? m.sourceFile)
      const covered: number[] = []
      const missed: number[] = []
      if (hits && m.bodyStart !== undefined && m.bodyEnd !== undefined) {
        for (const [line, count] of hits) {
          if (line < m.bodyStart || line > m.bodyEnd) continue
          if (count > 0) covered.push(line)
          else missed.push(line)
        }
      }
      const total = covered.length + missed.length
      const ratio = total ? covered.length / total : 0
      const status =
        total === 0
          ? ('unknown' as const)
          : covered.length === 0
            ? ('uncovered' as const)
            : missed.length === 0
              ? ('covered' as const)
              : ('partial' as const)
      return {
        name: m.name,
        sourceFile: m.sourceFile,
        exposed: m.expose !== false,
        description: m.description ?? null,
        coveredLines: covered.length,
        totalLines: total,
        missedLines: missed.sort((a, b) => a - b),
        ratio: Number(ratio.toFixed(3)),
        status,
      }
    })
    .sort((a, b) => a.ratio - b.ratio || a.name.localeCompare(b.name))

  const summary = {
    total: functions.length,
    covered: 0,
    partial: 0,
    uncovered: 0,
    unknown: 0,
    overallRatio: 0,
  }
  for (const f of functions) summary[f.status]++
  summary.overallRatio = functions.length
    ? Number(
        (functions.reduce((a, f) => a + f.ratio, 0) / functions.length).toFixed(
          3
        )
      )
    : 0

  return {
    generatedAt: new Date().toISOString(),
    summary,
    functions,
  }
}
