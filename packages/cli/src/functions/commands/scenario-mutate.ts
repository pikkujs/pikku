import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import { pikkuSessionlessFunc } from '#pikku/function'
import { dim } from '../../utils/output.js'
import {
  DEFAULT_SKIP_LINE,
  classifyScenarioRun,
  groupSurvivors,
  pickMutants,
  scoreMutants,
  spliceMutant,
  type InconclusiveStage,
  type Mutant,
  type MutantResult,
  type MutationScore,
} from './scenario-mutate-core.js'

export interface ScenarioMutateReport extends MutationScore {
  environment: string
  flows: string[]
  minScore: number | null
  passed: boolean
  survivors: Record<
    string,
    { line: number; mutator: string; replacement: string }[]
  >
  inconclusiveByStage: Partial<Record<InconclusiveStage, number>>
}

const MINUTE = 60_000

/**
 * Run this same CLI again as a child. `scenario run` and `all` call
 * process.exit-style paths and boot a server, so each mutant gets a clean process.
 */
const runCli = (
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ code: number | null; output: string; timedOut: boolean }> =>
  new Promise((resolvePromise) => {
    const child = spawn(
      process.execPath,
      [...process.execArgv, process.argv[1]!, ...args],
      { cwd, env: { ...process.env, PIKKU_NO_LOGO: '1' } }
    )
    let output = ''
    let timedOut = false
    const append = (chunk: Buffer) => {
      output = (output + chunk).slice(-512 * 1024)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      resolvePromise({ code: 1, output: output + String(error), timedOut })
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolvePromise({ code, output, timedOut })
    })
  })

const runTsc = (cwd: string, tsconfig: string, timeoutMs: number) =>
  new Promise<{ code: number | null; timedOut: boolean }>((resolvePromise) => {
    // The real compiler: `pikku scenario run --tsc-summary` does not fail on type errors.
    const child = spawn(
      'npx',
      ['--no-install', 'tsc', '--noEmit', '-p', tsconfig],
      {
        cwd,
        stdio: 'ignore',
      }
    )
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.once('error', () => resolvePromise({ code: 1, timedOut }))
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolvePromise({ code, timedOut })
    })
  })

/** Stryker is an optional peer: load it only when this command runs. */
const loadStryker = async (): Promise<{
  Stryker: new (options: Record<string, unknown>) => {
    runMutationTest(): Promise<any[]>
  }
}> => {
  const name = '@stryker-mutator/core'
  try {
    return await import(name)
  } catch {
    throw new Error(
      '`pikku scenario mutate` needs StrykerJS to generate mutants. Install it in the project: ' +
        'npm i -D @stryker-mutator/core @stryker-mutator/typescript-checker'
    )
  }
}

/**
 * StrykerJS as a mutant generator only. Its instrumentation breaks pikku's
 * inspector, so the test command is a no-op and each mutant is spliced into
 * the original source by the caller.
 */
const generateMutants = async (
  rootDir: string,
  files: string[],
  excludedMutations: string[],
  tsconfig: string
): Promise<Mutant[]> => {
  const { Stryker } = await loadStryker()
  const options: Record<string, unknown> = {
    testRunner: 'command',
    commandRunner: { command: 'true' },
    coverageAnalysis: 'off',
    inPlace: true,
    mutate: files,
    mutator: { excludedMutations },
    reporters: [],
    cleanTempDir: true,
    ignorePatterns: ['.pikku', '.stryker-tmp'],
    tsconfigFile: tsconfig,
  }
  try {
    await import('@stryker-mutator/typescript-checker' as string)
    options.checkers = ['typescript']
  } catch {
    // Without the checker, non-compiling mutants reach `tsc` and count as inconclusive.
  }
  const previous = process.cwd()
  process.chdir(rootDir)
  let results: any[]
  try {
    results = await new Stryker(options).runMutationTest()
  } finally {
    process.chdir(previous)
  }
  const sources = new Map<string, string[]>()
  const mutants: Mutant[] = []
  for (const result of results) {
    if (result.status !== 'Survived') continue
    const file = relative(rootDir, resolve(rootDir, result.fileName)).replace(
      /\\/g,
      '/'
    )
    const lines =
      sources.get(file) ??
      readFileSync(resolve(rootDir, file), 'utf8').split('\n')
    sources.set(file, lines)
    const line = result.location.start.line
    if (DEFAULT_SKIP_LINE.test(lines[line - 1] ?? '')) continue
    mutants.push({
      file,
      mutator: result.mutatorName,
      line,
      location: result.location,
      replacement: result.replacement ?? '',
    })
  }
  return mutants
}

export const scenarioMutate = pikkuSessionlessFunc<
  {
    environment: string
    files: string
    flows?: string
    perFile?: number
    maxMutants?: number
    minScore?: number
    minMutants?: number
    exclude?: string
    timeout?: number
    apiUrl?: string
    spawn?: boolean
  },
  ScenarioMutateReport
>({
  func: async (
    { logger, config },
    {
      environment,
      files,
      flows,
      perFile = 12,
      maxMutants,
      minScore,
      minMutants = 1,
      exclude = 'StringLiteral,ArrayDeclaration',
      timeout = 10,
      apiUrl,
      spawn: spawnServer = true,
    }
  ) => {
    if (!flows) {
      throw new Error(
        '--flows is required: name the scenario(s) that must catch the mutants.'
      )
    }
    const rootDir = config.rootDir
    const tsconfig = relative(rootDir, config.tsconfig) || 'tsconfig.json'
    const stageTimeout = timeout * MINUTE
    const patterns = files
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)

    logger.info('Generating mutants with StrykerJS…')
    let mutants = pickMutants(
      await generateMutants(
        rootDir,
        patterns,
        exclude
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean),
        tsconfig
      ),
      perFile
    )
    if (maxMutants !== undefined) mutants = mutants.slice(0, maxMutants)
    logger.info(`Running ${mutants.length} mutants against ${flows}`)

    const flowList = flows.split(',').map((part) => part.trim())
    const passthrough = [
      ...(spawnServer ? ['--spawn'] : []),
      ...(apiUrl ? ['--apiUrl', apiUrl] : []),
    ]

    const results: MutantResult[] = []
    const originals = new Map<string, string>()
    const restore = () => {
      for (const [file, source] of originals)
        writeFileSync(resolve(rootDir, file), source)
    }
    const onSignal = () => {
      restore()
      process.exit(130)
    }
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)

    const judge = async (mutant: Mutant): Promise<MutantResult> => {
      const base = {
        file: mutant.file,
        mutator: mutant.mutator,
        line: mutant.line,
        replacement: mutant.replacement,
      }
      const inconclusive = (stage: InconclusiveStage): MutantResult => ({
        ...base,
        outcome: 'inconclusive',
        stage,
      })
      const path = resolve(rootDir, mutant.file)
      if (!originals.has(mutant.file))
        originals.set(mutant.file, readFileSync(path, 'utf8'))
      const original = originals.get(mutant.file)!
      try {
        writeFileSync(
          path,
          spliceMutant(original, mutant.location, mutant.replacement)
        )
        const codegen = await runCli(['all'], rootDir, stageTimeout)
        if (codegen.timedOut) return inconclusive('timeout')
        if (codegen.code !== 0) return inconclusive('codegen')
        const tsc = await runTsc(rootDir, tsconfig, stageTimeout)
        if (tsc.timedOut) return inconclusive('timeout')
        if (tsc.code !== 0) return inconclusive('tsc')
        const run = await runCli(
          [
            'scenario',
            'run',
            environment,
            '--flows',
            flowList.join(','),
            ...passthrough,
          ],
          rootDir,
          stageTimeout
        )
        const verdict = classifyScenarioRun(run)
        return verdict === 'killed' || verdict === 'survived'
          ? { ...base, outcome: verdict }
          : inconclusive(verdict)
      } finally {
        writeFileSync(path, original)
      }
    }

    try {
      for (const [index, mutant] of mutants.entries()) {
        const result = await judge(mutant)
        results.push(result)
        logger.info(
          `[${index + 1}/${mutants.length}] ${mutant.file}:${mutant.line} ${mutant.mutator} → ${result.outcome}${result.stage ? ` (${result.stage})` : ''}`
        )
      }
    } finally {
      restore()
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
      // The last mutant's generated code is still on disk; put the clean one back.
      if (originals.size > 0) await runCli(['all'], rootDir, stageTimeout)
    }

    const score = scoreMutants(results)
    const conclusive = score.killed + score.survived
    const passed =
      minScore === undefined
        ? true
        : conclusive >= minMutants && (score.score ?? 0) >= minScore
    if (!passed) process.exitCode = 1

    const inconclusiveByStage: ScenarioMutateReport['inconclusiveByStage'] = {}
    for (const result of results)
      if (result.stage)
        inconclusiveByStage[result.stage] =
          (inconclusiveByStage[result.stage] ?? 0) + 1

    return {
      ...score,
      environment,
      flows: flowList,
      minScore: minScore ?? null,
      passed,
      survivors: groupSurvivors(results),
      inconclusiveByStage,
    }
  },
})

export const renderScenarioMutate = (
  _services: unknown,
  report: ScenarioMutateReport
): void => {
  const lines = [
    report.score === null
      ? 'Mutation score  not measured — no mutant ran to a verdict'
      : `Mutation score  ${report.score}%  (${report.killed} killed, ${report.survived} survived, ${report.inconclusive} inconclusive)`,
  ]
  const stages = Object.entries(report.inconclusiveByStage)
  if (stages.length)
    lines.push(
      dim(
        `  inconclusive: ${stages.map(([stage, n]) => `${stage} ${n}`).join(', ')}`
      )
    )
  for (const [file, survivors] of Object.entries(report.survivors)) {
    lines.push(file)
    for (const { line, mutator, replacement } of survivors)
      lines.push(
        `  ${file}:${line}  ${mutator} ${dim(`→ ${replacement.slice(0, 60)}`)}`
      )
  }
  if (report.minScore !== null)
    lines.push(
      report.passed
        ? `Gate  passed (min ${report.minScore}%)`
        : `Gate  FAILED (min ${report.minScore}%)`
    )
  console.log(lines.join('\n'))
}
