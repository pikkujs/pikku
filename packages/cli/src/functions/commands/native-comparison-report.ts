export type ComparisonEngine = 'typescript' | 'native'

export const COMPARISON_ENGINES: readonly ComparisonEngine[] = [
  'typescript',
  'native',
]

export type ProcessPeak = {
  pid: number
  command: string
  peakRssBytes: number
  /** macOS only: the kernel's `phys_footprint_peak`, as of the last sample. */
  peakFootprintBytes?: number
}

export type RunMeasurement = {
  engine: ComparisonEngine
  run: number
  exitCode: number
  wallMs: number
  cpuUserMs: number
  cpuSysMs: number
  /** `rusage` from `/usr/bin/time`, or summed per-process `ps` samples. */
  cpuSource: 'rusage' | 'sampled'
  peakProcessRssBytes: number
  peakProcessRssCommand: string
  peakTotalRssBytes: number
  peakProcessFootprintBytes?: number
  peakProcessFootprintCommand?: string
  peakTotalFootprintBytes?: number
  processes: ProcessPeak[]
}

export type EngineSummary = {
  engine: ComparisonEngine
  runs: number
  wallMs: number
  cpuMs: number
  cpuUserMs: number
  cpuSysMs: number
  cpuSource: RunMeasurement['cpuSource']
  peakProcessRssBytes: number
  peakProcessRssCommand: string
  peakTotalRssBytes: number
  peakProcessFootprintBytes?: number
  peakProcessFootprintCommand?: string
  peakTotalFootprintBytes?: number
  /** Per-process peaks from the run whose wall time is closest to the median. */
  processes: ProcessPeak[]
}

/** Relative path → sha256 of the file's bytes. */
export type FileHashes = Record<string, string>

export type OutputDiff = {
  identical: boolean
  fileCount: number
  differing: string[]
  onlyInTypescript: string[]
  onlyInNative: string[]
}

export type NativeComparisonResult = {
  projectDir: string
  platform: string
  runs: number
  typescript: EngineSummary
  native: EngineSummary
  output: OutputDiff & {
    /** Files whose content changed between runs of the same engine. */
    nondeterministic: Record<ComparisonEngine, string[]>
  }
  measurements: RunMeasurement[]
  notes: string[]
}

export const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}

const medianOptional = (values: (number | undefined)[]): number | undefined => {
  const present = values.filter((v): v is number => v !== undefined)
  return present.length === 0 ? undefined : median(present)
}

/** The command most often responsible for a peak across runs. */
const mostCommon = (values: (string | undefined)[]): string | undefined => {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: string | undefined
  let bestCount = 0
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v
      bestCount = c
    }
  }
  return best
}

export const summarizeRuns = (
  engine: ComparisonEngine,
  measurements: RunMeasurement[]
): EngineSummary => {
  const runs = measurements.filter((m) => m.engine === engine)
  const wallMs = median(runs.map((r) => r.wallMs))
  const representative = [...runs].sort(
    (a, b) => Math.abs(a.wallMs - wallMs) - Math.abs(b.wallMs - wallMs)
  )[0]
  const cpuUserMs = median(runs.map((r) => r.cpuUserMs))
  const cpuSysMs = median(runs.map((r) => r.cpuSysMs))
  return {
    engine,
    runs: runs.length,
    wallMs,
    cpuMs: median(runs.map((r) => r.cpuUserMs + r.cpuSysMs)),
    cpuUserMs,
    cpuSysMs,
    cpuSource: runs.every((r) => r.cpuSource === 'rusage')
      ? 'rusage'
      : 'sampled',
    peakProcessRssBytes: median(runs.map((r) => r.peakProcessRssBytes)),
    peakProcessRssCommand:
      mostCommon(runs.map((r) => r.peakProcessRssCommand)) ?? '',
    peakTotalRssBytes: median(runs.map((r) => r.peakTotalRssBytes)),
    peakProcessFootprintBytes: medianOptional(
      runs.map((r) => r.peakProcessFootprintBytes)
    ),
    peakProcessFootprintCommand: mostCommon(
      runs.map((r) => r.peakProcessFootprintCommand)
    ),
    peakTotalFootprintBytes: medianOptional(
      runs.map((r) => r.peakTotalFootprintBytes)
    ),
    processes: representative?.processes ?? [],
  }
}

export const diffHashes = (
  typescript: FileHashes,
  native: FileHashes
): OutputDiff => {
  const differing: string[] = []
  const onlyInTypescript: string[] = []
  const onlyInNative: string[] = []
  for (const [file, hash] of Object.entries(typescript)) {
    if (!(file in native)) onlyInTypescript.push(file)
    else if (native[file] !== hash) differing.push(file)
  }
  for (const file of Object.keys(native)) {
    if (!(file in typescript)) onlyInNative.push(file)
  }
  differing.sort()
  onlyInTypescript.sort()
  onlyInNative.sort()
  return {
    identical:
      differing.length === 0 &&
      onlyInTypescript.length === 0 &&
      onlyInNative.length === 0,
    fileCount: new Set([...Object.keys(typescript), ...Object.keys(native)])
      .size,
    differing,
    onlyInTypescript,
    onlyInNative,
  }
}

/** Every file that differs between two runs, in any direction. */
export const changedFiles = (a: FileHashes, b: FileHashes): string[] => {
  const diff = diffHashes(a, b)
  return [
    ...diff.differing,
    ...diff.onlyInTypescript,
    ...diff.onlyInNative,
  ].sort()
}

export const formatDuration = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`

export const formatBytes = (bytes: number): string => {
  const mib = bytes / (1024 * 1024)
  return mib >= 1024
    ? `${(mib / 1024).toFixed(2)} GiB`
    : `${mib.toFixed(0)} MiB`
}

const signed = (value: number, format: (v: number) => string): string =>
  value === 0 ? '±0' : `${value > 0 ? '+' : '-'}${format(Math.abs(value))}`

const ratio = (native: number, typescript: number): string =>
  typescript > 0 ? `${(native / typescript).toFixed(2)}x` : '-'

type Row = [
  label: string,
  typescript: string,
  native: string,
  delta: string,
  ratio: string,
]

const metricRow = (
  label: string,
  typescript: number | undefined,
  native: number | undefined,
  format: (v: number) => string
): Row | undefined =>
  typescript === undefined || native === undefined
    ? undefined
    : [
        label,
        format(typescript),
        format(native),
        signed(native - typescript, format),
        ratio(native, typescript),
      ]

const formatProcesses = (
  result: NativeComparisonResult,
  limit = 6
): string[] => {
  const hasFootprint = COMPARISON_ENGINES.some((e) =>
    result[e].processes.some((p) => p.peakFootprintBytes !== undefined)
  )
  const lines = [
    `Processes (peak RSS${hasFootprint ? ', peak footprint' : ''}):`,
  ]
  for (const engine of COMPARISON_ENGINES) {
    const { processes } = result[engine]
    lines.push(`  ${engine === 'typescript' ? 'TypeScript' : 'Native'}`)
    const width = Math.max(0, ...processes.map((p) => p.command.length))
    for (const p of processes.slice(0, limit)) {
      lines.push(
        `    ${p.command.padEnd(width)}  ${formatBytes(p.peakRssBytes).padStart(9)}${
          p.peakFootprintBytes !== undefined
            ? `  ${formatBytes(p.peakFootprintBytes).padStart(9)}`
            : ''
        }`.trimEnd()
      )
    }
    if (processes.length > limit) {
      lines.push(`    … and ${processes.length - limit} more`)
    }
  }
  return lines
}

const padTable = (rows: Row[]): string[] => {
  const widths = rows[0]!.map((_, i) =>
    Math.max(...rows.map((r) => r[i]!.length))
  )
  return rows.map((r) =>
    r
      .map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!)))
      .join('   ')
      .trimEnd()
  )
}

const listFiles = (title: string, files: string[], limit: number): string[] =>
  files.length === 0
    ? []
    : [
        `  ${title} (${files.length}):`,
        ...files.slice(0, limit).map((f) => `    ${f}`),
        ...(files.length > limit
          ? [`    … and ${files.length - limit} more`]
          : []),
      ]

export const formatComparison = (
  result: NativeComparisonResult,
  { fileLimit = 20 }: { fileLimit?: number } = {}
): string => {
  const { typescript: ts, native } = result
  const rows = [
    ['', 'TypeScript', 'Native', 'Δ', 'ratio'] as Row,
    metricRow('Wall time', ts.wallMs, native.wallMs, formatDuration),
    metricRow('CPU time (user+sys)', ts.cpuMs, native.cpuMs, formatDuration),
    metricRow('  user', ts.cpuUserMs, native.cpuUserMs, formatDuration),
    metricRow('  sys', ts.cpuSysMs, native.cpuSysMs, formatDuration),
    metricRow(
      'Peak RSS, largest process',
      ts.peakProcessRssBytes,
      native.peakProcessRssBytes,
      formatBytes
    ),
    metricRow(
      'Peak RSS, process tree',
      ts.peakTotalRssBytes,
      native.peakTotalRssBytes,
      formatBytes
    ),
    metricRow(
      'Peak footprint, largest process',
      ts.peakProcessFootprintBytes,
      native.peakProcessFootprintBytes,
      formatBytes
    ),
    metricRow(
      'Peak footprint, process tree',
      ts.peakTotalFootprintBytes,
      native.peakTotalFootprintBytes,
      formatBytes
    ),
  ].filter((r): r is Row => r !== undefined)

  const lines: string[] = [
    `Inspector comparison: ${result.projectDir}`,
    `${result.runs === 1 ? '1 run' : `median of ${result.runs} runs`} per engine of \`pikku all\``,
    '',
    ...padTable(rows),
    '',
    ...formatProcesses(result),
    '',
  ]

  const { output } = result
  if (output.identical) {
    lines.push(`Output: identical (${output.fileCount} files)`)
  } else {
    lines.push(
      `Output: DIFFERS (${output.differing.length + output.onlyInTypescript.length + output.onlyInNative.length} of ${output.fileCount} files)`,
      ...listFiles('content differs', output.differing, fileLimit),
      ...listFiles('only from TypeScript', output.onlyInTypescript, fileLimit),
      ...listFiles('only from native', output.onlyInNative, fileLimit)
    )
  }
  for (const engine of COMPARISON_ENGINES) {
    lines.push(
      ...listFiles(
        `changed between ${engine} runs`,
        output.nondeterministic[engine],
        fileLimit
      )
    )
  }
  if (result.notes.length > 0) {
    lines.push('', ...result.notes.map((n) => `Note: ${n}`))
  }
  return `${lines.join('\n')}\n`
}
