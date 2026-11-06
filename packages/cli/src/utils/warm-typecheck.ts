import { spawn, type ChildProcess } from 'node:child_process'
import { statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import type TS from 'typescript'

export type CheckProject = { name: string; tsconfig: string; dir: string }

export type CheckDiagnostic = {
  severity: 'warn' | 'error' | 'critical'
  code: string
  message: string
  project?: string
  file?: string
  line?: number
  column?: number
}

export type TypecheckResult = {
  diagnostics: CheckDiagnostic[]
  durationMs: number
  rssBytes: number
}

const LOCKFILES = [
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]

/** Cannot find module, and its relatives. Nothing the builder tracks can clear these. */
const UNRESOLVED_IMPORT_CODES = new Set([2307, 2792, 2306, 7016])

const mtimeOf = (path: string): number => {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

const installStamp = (dir: string): string => {
  const stamps: number[] = []
  for (let at = dir; ; at = dirname(at)) {
    for (const name of LOCKFILES) stamps.push(mtimeOf(join(at, name)))
    if (dirname(at) === at) return stamps.join()
  }
}

const loadTypescript = (dir: string): typeof TS => {
  try {
    return createRequire(join(dir, 'noop.cjs'))('typescript')
  } catch {
    return createRequire(import.meta.url)('typescript')
  }
}

/**
 * One project's type checker, holding its program between checks. Each check
 * looks at file times itself, so the answer never depends on a file event having
 * arrived, and only what a change affected is checked again.
 */
export const createWarmChecker = (
  ts: typeof TS,
  project: CheckProject,
  rootDir: string
) => {
  let previous: TS.SemanticDiagnosticsBuilderProgram | undefined
  let settings = ''
  let unresolvedImports = false
  const parsed = new Map<
    string,
    { mtimeMs: number; size: number; file: TS.SourceFile }
  >()

  const toDiagnostic = (d: TS.Diagnostic): CheckDiagnostic | null => {
    const fileName = d.file?.fileName
    if (fileName?.includes('/node_modules/')) return null
    const at =
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start)
        : undefined
    const rel = fileName ? relative(rootDir, fileName) : undefined
    return {
      severity: d.category === ts.DiagnosticCategory.Error ? 'error' : 'warn',
      code: `TS${d.code}`,
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      project: project.name,
      ...(rel !== undefined
        ? { file: rel.startsWith('..') || isAbsolute(rel) ? fileName : rel }
        : {}),
      ...(at ? { line: at.line + 1, column: at.character + 1 } : {}),
    }
  }

  const check = (): CheckDiagnostic[] => {
    const configErrors: TS.Diagnostic[] = []
    const config = ts.getParsedCommandLineOfConfigFile(
      project.tsconfig,
      { noEmit: true },
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (d) => configErrors.push(d),
      }
    )
    if (!config) {
      return configErrors.flatMap((d) => toDiagnostic(d) ?? [])
    }

    const nextSettings = JSON.stringify([
      config.options,
      config.projectReferences,
      installStamp(project.dir),
    ])
    if (nextSettings !== settings) {
      settings = nextSettings
      previous = undefined
      parsed.clear()
    }
    if (unresolvedImports) previous = undefined

    const host = ts.createIncrementalCompilerHost(config.options, ts.sys)
    const parse = host.getSourceFile
    host.getSourceFile = (fileName, languageVersion, onError, create) => {
      let stat
      try {
        stat = statSync(fileName)
      } catch {
        parsed.delete(fileName)
        return undefined
      }
      const known = parsed.get(fileName)
      if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) {
        return known.file
      }
      const file = parse(fileName, languageVersion, onError, create)
      if (file) {
        parsed.set(fileName, { mtimeMs: stat.mtimeMs, size: stat.size, file })
      }
      return file
    }

    const program = ts.createProgram({
      rootNames: config.fileNames,
      options: config.options,
      projectReferences: config.projectReferences,
      configFileParsingDiagnostics: config.errors,
      oldProgram: previous?.getProgram(),
      host,
    })
    const builder = ts.createSemanticDiagnosticsBuilderProgram(
      program,
      host,
      previous
    )
    previous = builder

    const found = ts.sortAndDeduplicateDiagnostics([
      ...builder.getConfigFileParsingDiagnostics(),
      ...builder.getOptionsDiagnostics(),
      ...builder.getGlobalDiagnostics(),
      ...builder.getSyntacticDiagnostics(),
      ...builder.getSemanticDiagnostics(),
    ])
    unresolvedImports = found.some((d) => UNRESOLVED_IMPORT_CODES.has(d.code))
    return found.flatMap((d) => toDiagnostic(d) ?? [])
  }

  return { check }
}

type WorkerRequest = { id: number; rootDir: string; projects: CheckProject[] }
type WorkerResponse = { id: number; result?: TypecheckResult; error?: string }

/** The body of the worker process: answers check requests until stdin closes. */
export const runTypecheckWorker = async (): Promise<void> => {
  const checkers = new Map<string, ReturnType<typeof createWarmChecker>>()
  for await (const line of createInterface({ input: process.stdin })) {
    const { id, rootDir, projects } = JSON.parse(line) as WorkerRequest
    const started = Date.now()
    const response: WorkerResponse = { id }
    try {
      const diagnostics = projects.flatMap((project) => {
        let checker = checkers.get(project.tsconfig)
        if (!checker) {
          checker = createWarmChecker(
            loadTypescript(project.dir),
            project,
            rootDir
          )
          checkers.set(project.tsconfig, checker)
        }
        return checker.check()
      })
      response.result = {
        diagnostics,
        durationMs: Date.now() - started,
        rssBytes: process.memoryUsage().rss,
      }
    } catch (error) {
      checkers.clear()
      response.error = error instanceof Error ? error.message : String(error)
    }
    process.stdout.write(`${JSON.stringify(response)}\n`)
  }
}

/**
 * Talks to the worker. Starts it on the first check and again after a crash; it
 * exits by itself when this process goes, because its stdin closes.
 */
export const createTypecheckClient = (rootDir: string) => {
  let worker: ChildProcess | undefined
  let nextId = 0
  const pending = new Map<
    number,
    { resolve: (r: TypecheckResult) => void; reject: (e: Error) => void }
  >()

  const start = (): ChildProcess => {
    const child = spawn(
      process.execPath,
      [...process.execArgv, process.argv[1]!, '__typecheck-worker'],
      {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: { ...process.env, PIKKU_NO_LOGO: '1' },
      }
    )
    createInterface({ input: child.stdout! }).on('line', (line) => {
      let response: WorkerResponse
      try {
        response = JSON.parse(line) as WorkerResponse
      } catch {
        return
      }
      const request = pending.get(response.id)
      pending.delete(response.id)
      if (response.result) request?.resolve(response.result)
      else request?.reject(new Error(response.error ?? 'no result'))
    })
    const onGone = (reason: string) => {
      if (worker === child) worker = undefined
      for (const request of pending.values()) {
        request.reject(new Error(`the type checker stopped (${reason})`))
      }
      pending.clear()
    }
    child.once('error', (error) => onGone(error.message))
    child.once('exit', (code, signal) => onGone(signal ?? `exit ${code}`))
    return child
  }

  return {
    check: (projects: CheckProject[]): Promise<TypecheckResult> =>
      new Promise((resolve, reject) => {
        worker ??= start()
        const id = ++nextId
        pending.set(id, { resolve, reject })
        worker.stdin!.write(
          `${JSON.stringify({ id, rootDir, projects } satisfies WorkerRequest)}\n`
        )
      }),
  }
}
