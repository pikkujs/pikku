import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

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

const live = new Set<ChildProcess>()
const track = <T extends ChildProcess>(child: T): T => {
  live.add(child)
  child.once('exit', () => live.delete(child))
  return child
}

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
    const child = track(
      spawn(
        process.execPath,
        [...process.execArgv, process.argv[1]!, ...args],
        {
          cwd,
          env: { ...process.env, PIKKU_NO_LOGO: '1' },
        }
      )
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
    const child = track(
      spawn('npx', ['--no-install', 'tsc', '--noEmit', '-p', tsconfig], {
        cwd,
        stdio: 'ignore',
      })
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

/**
 * Resolve an optional peer from the project first, then from the CLI. A project
 * install is nested (bun, pnpm), so Stryker's own plugin lookup cannot find a
 * sibling checker; naming the resolved paths as `plugins` fixes that.
 */
const resolvePeer = (rootDir: string, name: string): string | undefined => {
  for (const base of [join(rootDir, 'package.json'), import.meta.url]) {
    try {
      return createRequire(base).resolve(name)
    } catch {
      // try the next place
    }
  }
  return undefined
}

const loadStryker = async (
  rootDir: string
): Promise<{
  Stryker: new (options: Record<string, unknown>) => {
    runMutationTest(): Promise<any[]>
  }
}> => {
  const core = resolvePeer(rootDir, '@stryker-mutator/core')
  if (!core) {
    throw new Error(
      '`pikku scenario mutate` needs StrykerJS to generate mutants. Install it in the project: ' +
        'npm i -D @stryker-mutator/core @stryker-mutator/typescript-checker'
    )
  }
  return import(pathToFileURL(core).href)
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
  tsconfig: string,
  useChecker: boolean,
  warn: (message: string) => void
): Promise<Mutant[]> => {
  const { Stryker } = await loadStryker(rootDir)
  const options: Record<string, unknown> = {
    testRunner: 'command',
    commandRunner: { command: 'true' },
    coverageAnalysis: 'off',
    inPlace: false,
    mutate: files,
    mutator: { excludedMutations },
    reporters: [],
    cleanTempDir: true,
    ignorePatterns: ['.pikku', '.stryker-tmp'],
    tsconfigFile: tsconfig,
  }
  const checker = resolvePeer(rootDir, '@stryker-mutator/typescript-checker')
  if (checker && !useChecker) {
    warn(
      'The project does not type-check as it stands, and the Stryker checker refuses to start on that. ' +
        'Mutants are not type-checked, so one that does not compile is run anyway.'
    )
  }
  if (checker && useChecker) {
    // Without the checker, non-compiling mutants reach `tsc` and count as inconclusive.
    options.checkers = ['typescript']
    options.plugins = [resolvePeer(rootDir, '@stryker-mutator/core')!, checker]
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

    // Fail on a missing Stryker before spending a type-check on the answer.
    await loadStryker(rootDir)
    const baseline = await runTsc(rootDir, tsconfig, stageTimeout)
    if (baseline.timedOut) throw new Error('The baseline tsc timed out.')
    logger.info('Generating mutants with StrykerJS…')
    let mutants = pickMutants(
      await generateMutants(
        rootDir,
        patterns,
        exclude
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean),
        tsconfig,
        baseline.code === 0,
        (message) => logger.warn(message)
      ),
      perFile
    )
    if (maxMutants !== undefined) mutants = mutants.slice(0, maxMutants)
    if (mutants.length === 0) {
      throw new Error(
        `No mutants were generated from --files ${files}. Check the globs match source files under ${rootDir} that contain behaviour (schemas, imports and config lines are skipped).`
      )
    }

    const flowList = flows.split(',').map((part) => part.trim())
    const passthrough = [
      ...(spawnServer ? ['--spawn'] : []),
      ...(apiUrl ? ['--apiUrl', apiUrl] : []),
    ]
    const scenarioArgs = [
      'scenario',
      'run',
      environment,
      '--flows',
      flowList.join(','),
      ...passthrough,
    ]

    logger.info(`Checking ${flows} passes on the unmutated code…`)
    const clean = await runCli(['all'], rootDir, stageTimeout)
    if (clean.code !== 0)
      throw new Error(
        `Codegen fails on the unmutated project, so no mutant can be judged:\n${clean.output.slice(-2000)}`
      )
    const cleanRun = classifyScenarioRun(
      await runCli(scenarioArgs, rootDir, stageTimeout)
    )
    if (cleanRun !== 'survived')
      throw new Error(
        cleanRun === 'killed'
          ? `${flows} fails on the unmutated code: every mutant would count as killed. Fix the scenario first.`
          : `${flows} did not run on the unmutated code (${cleanRun}): no mutant can be judged.`
      )
    logger.info(`Running ${mutants.length} mutants against ${flows}`)

    const results: MutantResult[] = []
    const originals = new Map<string, string>()
    const restore = () => {
      for (const [file, source] of originals)
        writeFileSync(resolve(rootDir, file), source)
    }
    const onSignal = () => {
      for (const child of live) child.kill('SIGTERM')
      restore()
      spawnSync(
        process.execPath,
        [...process.execArgv, process.argv[1]!, 'all'],
        { cwd: rootDir, stdio: 'ignore', timeout: stageTimeout }
      )
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
        if (baseline.code === 0) {
          const tsc = await runTsc(rootDir, tsconfig, stageTimeout)
          if (tsc.timedOut) return inconclusive('timeout')
          if (tsc.code !== 0) return inconclusive('tsc')
        }
        const run = await runCli(scenarioArgs, rootDir, stageTimeout)
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
