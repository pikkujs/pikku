import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import type { CLILogger } from '../../services/cli-logger.service.js'
import { currentCliInvocation } from './native-comparison-measure.js'
import {
  COMPARISON_ENGINES,
  diffHashes,
  type ComparisonEngine,
  type FileHashes,
  type OutputDiff,
} from './native-comparison-report.js'
import {
  GeneratedSnapshot,
  hashGeneratedOutput,
} from './native-comparison-snapshot.js'

export type InspectorParityInput = {
  config?: string
  details?: string
  /** Text both engines' failing `pikku all` must log, for a project whose codegen is meant to fail. */
  expectFailure?: string
}

export type InspectorParityResult = {
  projectDir: string
  identical: boolean
  /** Paths in the inspector state at which the engines differ. */
  state: string[]
  /** Generated files that differ, run logs aside. */
  output: OutputDiff
  /** Diagnostics (`[PKU…]` lines) only one engine logged. */
  diagnostics: { onlyInTypescript: string[]; onlyInNative: string[] }
}

/** Timings and live compiler objects, which no second engine reproduces. */
const ENGINE_LOCAL_FIELDS = new Set(['typesLookup', 'program', 'stats'])

/** `pikku all`'s own run records (`.pikku/runs/*.jsonl`) are timestamped. */
const RUN_RECORDS = /(^|\/)runs\/[^/]+\.jsonl$/

/** The paths at which two JSON values differ, up to `limit` of them. */
export const diffPaths = (
  a: unknown,
  b: unknown,
  limit: number,
  path = '$',
  out: string[] = []
): string[] => {
  if (out.length >= limit || Object.is(a, b)) return out
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    out.push(
      `${path}: ${JSON.stringify(a)?.slice(0, 160)} != ${JSON.stringify(b)?.slice(0, 160)}`
    )
    return out
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    diffPaths(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      limit,
      `${path}.${key}`,
      out
    )
  }
  return out
}

/** The state `--stateOutput` saved, without the engine-local fields. */
export const comparableState = (json: string): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(JSON.parse(json) as Record<string, unknown>).filter(
      ([key]) => !ENGINE_LOCAL_FIELDS.has(key)
    )
  )

const ANSI = /\x1b\[[0-9;]*m/g

/** Every logged line carrying an error code, sorted. */
export const diagnosticLines = (log: string): string[] =>
  log
    .replace(ANSI, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\bPKU\d+\b/.test(line))
    .sort()

const onlyIn = (a: string[], b: string[]) => {
  const rest = [...b]
  return a.filter((line) => {
    const i = rest.indexOf(line)
    if (i === -1) return true
    rest.splice(i, 1)
    return false
  })
}

export type EngineRun = { state: string; files: FileHashes; log: string }

export const compareRuns = (
  projectDir: string,
  typescript: EngineRun,
  native: EngineRun,
  limit: number
): InspectorParityResult => {
  const withoutRunRecords = (files: FileHashes): FileHashes =>
    Object.fromEntries(
      Object.entries(files).filter(([file]) => !RUN_RECORDS.test(file))
    )
  const state = diffPaths(
    comparableState(typescript.state),
    comparableState(native.state),
    limit
  )
  const output = diffHashes(
    withoutRunRecords(typescript.files),
    withoutRunRecords(native.files)
  )
  const tsLines = diagnosticLines(typescript.log)
  const nativeLines = diagnosticLines(native.log)
  const diagnostics = {
    onlyInTypescript: onlyIn(tsLines, nativeLines),
    onlyInNative: onlyIn(nativeLines, tsLines),
  }
  return {
    projectDir,
    identical:
      state.length === 0 &&
      output.identical &&
      diagnostics.onlyInTypescript.length === 0 &&
      diagnostics.onlyInNative.length === 0,
    state,
    output,
    diagnostics,
  }
}

const runAll = (
  cwd: string,
  args: string[]
): Promise<{ code: number | null; log: string }> =>
  new Promise((resolve, reject) => {
    const { command, args: cliArgs } = currentCliInvocation()
    const child = spawn(command, [...cliArgs, 'all', ...args], {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    let log = ''
    child.stdout.on('data', (chunk) => (log += chunk))
    child.stderr.on('data', (chunk) => (log += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, log }))
  })

const tail = (text: string, lines = 40): string =>
  text.trimEnd().split('\n').slice(-lines).join('\n')

/**
 * Runs `pikku all` with the TypeScript inspector and then the native one, each
 * from the same generated state, and fails unless both save the same inspector
 * state, generate the same files and log the same diagnostics.
 *
 * A project whose codegen is meant to fail (a verifier of a build error) names
 * the message with `--expectFailure`: both engines must then fail with it,
 * and still agree on the state they saved, the files they wrote before
 * failing and the diagnostics they logged. A run that succeeds, or fails
 * without the message, is a failure.
 */
export const inspectorParity = pikkuSessionlessFunc<
  InspectorParityInput,
  InspectorParityResult
>({
  func: async ({ config, logger }, input) => {
    const { rootDir, outDir } = config
    const limit = Number(input?.details ?? 20)
    const expectFailure = input?.expectFailure
    const extraArgs = input?.config ? ['--config', input.config] : []
    const stateDir = mkdtempSync(join(tmpdir(), 'pikku-inspector-parity-'))
    const snapshot = GeneratedSnapshot.take(rootDir, outDir)
    const runs = {} as Record<ComparisonEngine, EngineRun>
    try {
      for (const engine of COMPARISON_ENGINES) {
        snapshot.restore()
        logger.info(`Running pikku all with the ${engine} inspector…`)
        const stateFile = join(stateDir, `${engine}.json`)
        const { code, log } = await runAll(rootDir, [
          '--inspector',
          engine,
          `--stateOutput=${stateFile}`,
          ...extraArgs,
        ])
        if (expectFailure ? code === 0 : code !== 0) {
          throw new Error(
            expectFailure
              ? `pikku all --inspector ${engine} succeeded, but ${JSON.stringify(expectFailure)} was expected to fail it:\n${tail(log)}`
              : `pikku all --inspector ${engine} exited with ${code}:\n${tail(log)}`
          )
        }
        if (expectFailure && !log.replace(ANSI, '').includes(expectFailure)) {
          throw new Error(
            `pikku all --inspector ${engine} failed without ${JSON.stringify(expectFailure)}:\n${tail(log)}`
          )
        }
        runs[engine] = {
          state: existsSync(stateFile)
            ? readFileSync(stateFile, 'utf-8')
            : '{}',
          files: hashGeneratedOutput(rootDir, outDir),
          log,
        }
      }
    } finally {
      snapshot.restore()
      snapshot.dispose()
      rmSync(stateDir, { recursive: true, force: true })
    }
    const result = compareRuns(rootDir, runs.typescript, runs.native, limit)
    if (!result.identical) process.exitCode = 1
    return result
  },
})

export const formatInspectorParity = (
  result: InspectorParityResult
): string => {
  if (result.identical) {
    return `Both inspectors agree on ${result.projectDir}: same state, ${result.output.fileCount} identical generated files, same diagnostics.\n`
  }
  const lines = [`The inspectors differ on ${result.projectDir}:`]
  if (result.state.length > 0) {
    lines.push('', 'Inspector state (typescript != native):')
    lines.push(...result.state.map((d) => `  ${d}`))
  }
  const { differing, onlyInTypescript, onlyInNative } = result.output
  if (!result.output.identical) {
    lines.push('', 'Generated files:')
    lines.push(...differing.map((f) => `  differs  ${f}`))
    lines.push(...onlyInTypescript.map((f) => `  typescript only  ${f}`))
    lines.push(...onlyInNative.map((f) => `  native only  ${f}`))
  }
  const { diagnostics } = result
  if (diagnostics.onlyInTypescript.length + diagnostics.onlyInNative.length) {
    lines.push('', 'Diagnostics:')
    lines.push(
      ...diagnostics.onlyInTypescript.map((l) => `  typescript only  ${l}`)
    )
    lines.push(...diagnostics.onlyInNative.map((l) => `  native only  ${l}`))
  }
  return `${lines.join('\n')}\n`
}

export const renderInspectorParity = (
  _services: { logger: CLILogger },
  result: InspectorParityResult
): void => {
  process.stdout.write(formatInspectorParity(result))
}
