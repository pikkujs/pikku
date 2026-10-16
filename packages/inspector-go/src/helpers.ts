import { spawn, spawnSync } from 'node:child_process'
import type { SurfaceEntrypoint } from '@pikku/inspector/surface'
import { findInspectorBinary } from './binary.js'

/**
 * The small read-only helpers the CLI uses outside an inspection, run in the
 * `pikku-inspect` binary through `pikku-inspect helper <method>`. Each takes
 * and returns what its `@pikku/inspector` (or CLI) counterpart does.
 */

type HelperResponse<T> = {
  result: T
  error?: { name?: string; message: string }
}

export class InspectorHelperError extends Error {
  constructor(message: string, name = 'InspectorHelperError') {
    super(message)
    this.name = name
  }
}

const unwrap = <T>(method: string, binary: string, stdout: string): T => {
  let response: HelperResponse<T>
  try {
    response = JSON.parse(stdout)
  } catch (error: any) {
    throw new InspectorHelperError(
      `${binary} helper ${method} printed something that is not JSON: ${error.message}`
    )
  }
  if (response.error) {
    throw new InspectorHelperError(
      response.error.message,
      response.error.name || undefined
    )
  }
  return response.result
}

const callSync = <T>(method: string, params: unknown): T => {
  const binary = findInspectorBinary()
  const child = spawnSync(binary, ['helper', method], {
    input: JSON.stringify(params),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  if (child.error) {
    throw new InspectorHelperError(
      `Could not start ${binary}: ${child.error.message}`
    )
  }
  if (child.status !== 0) {
    throw new InspectorHelperError(
      `${binary} helper ${method} exited with ${child.signal ?? `code ${child.status}`}`
    )
  }
  return unwrap<T>(method, binary, child.stdout)
}

const call = <T>(method: string, params: unknown): Promise<T> =>
  new Promise((resolvePromise, reject) => {
    const binary = findInspectorBinary()
    const child = spawn(binary, ['helper', method], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    const chunks: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', (error) =>
      reject(
        new InspectorHelperError(`Could not start ${binary}: ${error.message}`)
      )
    )
    child.on('close', (code, signal) => {
      if (code !== 0) {
        reject(
          new InspectorHelperError(
            `${binary} helper ${method} exited with ${signal ?? `code ${code}`}`
          )
        )
        return
      }
      try {
        resolvePromise(
          unwrap<T>(method, binary, Buffer.concat(chunks).toString('utf8'))
        )
      } catch (error) {
        reject(error)
      }
    })
    child.stdin.end(JSON.stringify(params))
  })

export type JsxLiteralText = { text: string; line: number }
export type SourceFileInput = { fileName: string; content: string }

export const readJsxLiteralText = (
  fileName: string,
  content: string
): JsxLiteralText[] => callSync('readJsxLiteralText', { fileName, content })

/** readJsxLiteralText for many files in one process, results in input order. */
export const readJsxLiteralTextBatch = (
  files: SourceFileInput[]
): JsxLiteralText[][] =>
  files.length === 0 ? [] : callSync('readJsxLiteralTextBatch', { files })

export const readModuleSpecifiers = (
  fileName: string,
  content: string
): string[] => callSync('readModuleSpecifiers', { fileName, content })

/** readModuleSpecifiers for many files in one process, results in input order. */
export const readModuleSpecifiersBatch = (
  files: SourceFileInput[]
): string[][] =>
  files.length === 0 ? [] : callSync('readModuleSpecifiersBatch', { files })

export const readTsconfigOutDir = (tsconfig: string): string | undefined =>
  callSync<string | null>('readTsconfigOutDir', { tsconfig }) ?? undefined

export type CollectSurfaceOptions = {
  importsSubpath?: string
  subpaths?: string[]
  snippets?: Map<string, string>
}

/**
 * collectSurface from `@pikku/inspector/surface`. An `@example snippet:`
 * naming an unknown snippet rejects with an error named UnknownSnippetError.
 */
export const collectSurface = (
  packageDir: string,
  { importsSubpath, subpaths, snippets }: CollectSurfaceOptions = {}
): Promise<SurfaceEntrypoint[]> =>
  call('collectSurface', {
    packageDir,
    importsSubpath,
    subpaths,
    snippets: snippets ? [...snippets] : undefined,
  })

export type StubProblemKind =
  | 'no-flag'
  | 'flag-not-literal'
  | 'undeclared-flag'
  | 'backend-supports'
  | 'mock-invalid'
  | 'no-mock'
export type StubCall = {
  file: string
  line: number
  hook: string
  rpc?: string
  flag?: string
  problem?: StubProblemKind
}
export type PlainCall = {
  file: string
  line: number
  hook: string
  rpc?: string
}
export type FrontendScan = { stubCalls: StubCall[]; plainCalls: PlainCall[] }
export type HookCall =
  (StubCall & { stub: true }) | (PlainCall & { stub: false })

/** scanFrontend from the CLI's mocks/stub-scan. */
export const scanFrontend = (
  rootDir: string,
  files: string[],
  client?: string
): FrontendScan => callSync('scanFrontend', { rootDir, files, client })

/** scanHooks from the CLI's mocks/stub-scan, without an import check. */
export const scanHooks = (file: string, text: string): HookCall[] =>
  callSync('scanHooks', { file, text })
