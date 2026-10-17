import type { ChildProcess } from 'node:child_process'
import { pikkuSessionlessFunc } from '#pikku/function'
import type { CLILogger } from '../../services/cli-logger.service.js'
import {
  currentCliInvocation,
  measureRun,
} from './native-comparison-measure.js'
import {
  COMPARISON_ENGINES,
  changedFiles,
  diffHashes,
  formatComparison,
  formatDuration,
  summarizeRuns,
  type ComparisonEngine,
  type FileHashes,
  type NativeComparisonResult,
  type RunMeasurement,
} from './native-comparison-report.js'
import {
  GeneratedSnapshot,
  hashGeneratedOutput,
} from './native-comparison-snapshot.js'

export type ExperimentNativeComparisonInput = {
  runs?: string
  config?: string
}

const ENGINE_LABEL: Record<ComparisonEngine, string> = {
  typescript: 'TypeScript',
  native: 'native',
}

export const parseRuns = (value: string | number | undefined): number => {
  if (value === undefined || value === '') return 1
  const runs = Number(value)
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error(`--runs must be a positive integer, not '${value}'`)
  }
  return runs
}

const tail = (text: string, lines = 40): string =>
  text.trimEnd().split('\n').slice(-lines).join('\n')

/**
 * Runs the project's codegen once per engine (`pikku all --inspector
 * typescript`, then `--inspector native`), each from the same generated state,
 * and compares their time, memory and output.
 */
export const experimentNativeComparison = pikkuSessionlessFunc<
  ExperimentNativeComparisonInput,
  NativeComparisonResult
>({
  func: async ({ config, logger }, input) => {
    const runs = parseRuns(input?.runs)
    const { rootDir, outDir } = config
    const cli = currentCliInvocation()
    const extraArgs = input?.config ? ['--config', input.config] : []

    const snapshot = GeneratedSnapshot.take(rootDir, outDir)
    let child: ChildProcess | undefined
    const onSignal = (signal: NodeJS.Signals): void => {
      child?.kill('SIGKILL')
      snapshot.restore()
      snapshot.dispose()
      process.exit(signal === 'SIGINT' ? 130 : 143)
    }
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)

    const measurements: RunMeasurement[] = []
    const outputs: Record<ComparisonEngine, FileHashes[]> = {
      typescript: [],
      native: [],
    }
    try {
      for (let run = 1; run <= runs; run++) {
        for (const engine of COMPARISON_ENGINES) {
          snapshot.restore()
          logger.info(
            `Running pikku all with the ${ENGINE_LABEL[engine]} inspector${runs > 1 ? ` (run ${run} of ${runs})` : ''}…`
          )
          const { stdout, stderr, ...measurement } = await measureRun({
            engine,
            run,
            cwd: rootDir,
            cli,
            extraArgs,
            onSpawn: (spawned) => (child = spawned),
          })
          child = undefined
          if (measurement.exitCode !== 0) {
            throw new Error(
              `pikku all --inspector ${engine} exited with ${measurement.exitCode}:\n${tail(`${stdout}\n${stderr}`)}`
            )
          }
          logger.info(`  done in ${formatDuration(measurement.wallMs)}`)
          measurements.push(measurement)
          outputs[engine].push(hashGeneratedOutput(rootDir, outDir))
        }
      }
    } finally {
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
      snapshot.restore()
      snapshot.dispose()
    }

    const nondeterministic = Object.fromEntries(
      COMPARISON_ENGINES.map((engine) => {
        const [first, ...rest] = outputs[engine]
        const files = new Set(rest.flatMap((o) => changedFiles(first!, o)))
        return [engine, [...files].sort()]
      })
    ) as Record<ComparisonEngine, string[]>

    const notes: string[] = []
    if (process.platform === 'darwin') {
      notes.push(
        "on macOS, RSS overstates what a process holds once it has freed memory: the Go runtime's freed pages stay resident until the system reclaims them. Footprint (phys_footprint, what Activity Monitor shows) is what the process is charged for, compressed pages included; its peak is the kernel's own high-water mark, as of the last sample before the process exited."
      )
    }
    if (measurements.some((m) => m.cpuSource === 'sampled')) {
      notes.push(
        'CPU time was summed from ps samples (no /usr/bin/time), so it misses up to one sample interval per process.'
      )
    }

    return {
      projectDir: rootDir,
      platform: process.platform,
      runs,
      typescript: summarizeRuns('typescript', measurements),
      native: summarizeRuns('native', measurements),
      output: {
        ...diffHashes(outputs.typescript[0]!, outputs.native[0]!),
        nondeterministic,
      },
      measurements,
      notes,
    }
  },
})

export const renderExperimentNativeComparison = (
  _services: { logger: CLILogger },
  result: NativeComparisonResult
): void => {
  process.stdout.write(formatComparison(result))
}
