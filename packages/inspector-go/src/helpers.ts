import { spawn, spawnSync } from 'node:child_process'
import {
  parseRemoteAddonPackage,
  type WireRemoteAddonSpec,
} from '@pikku/inspector'
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

export type SyntaxError = { code: number; start: number }

/** The parse diagnostics for `content`, read as `fileName`'s extension says (TypeScript by default): what `ts.transpileModule` reports as syntactic. */
export const readSyntaxErrors = (
  content: string,
  fileName?: string
): SyntaxError[] => callSync('readSyntaxErrors', { content, fileName })

export type JsxPropValue = string | number | boolean

/** The literal props of the JSX element starting at 1-based `line`, 0-based UTF-16 `col`, in source order; null when none starts there. */
export const readJsxProps = (
  source: string,
  line: number,
  col: number
): { name: string; value: JsxPropValue }[] | null =>
  callSync('readJsxProps', { source, line, col })

/** Sets, replaces or (with null) removes one literal prop; the source comes back unchanged when no element starts there. */
export const writeJsxProp = (
  source: string,
  line: number,
  col: number,
  name: string,
  value: JsxPropValue | null
): string => callSync('writeJsxProp', { source, line, col, name, value })

/** Edits the inline style classes of the element, throwing an InspectorHelperError named `JsxStyleError` when its className cannot be edited safely. */
export const writeJsxStyle = (
  source: string,
  line: number,
  col: number,
  styles: [string, string | null][]
): string =>
  callSync('writeJsxStyle', {
    source,
    line,
    col,
    styles: styles.map(([prop, value]) => ({ prop, value })),
  })

/** Every `wireRemoteAddon({ package: '<literal>' })` in one file. A `package` that is not a literal, or that does not parse, is skipped: the inspection reports those. */
export const findWireRemoteAddonSpecs = (
  fileName: string,
  content: string
): WireRemoteAddonSpec[] => {
  if (!content.includes('wireRemoteAddon')) return []
  const literals = callSync<
    { namespace: string | null; spec: string; line: number }[]
  >('findWireRemoteAddonLiterals', { fileName, content })
  const found: WireRemoteAddonSpec[] = []
  for (const { namespace, spec, line } of literals) {
    try {
      const { name, range } = parseRemoteAddonPackage(spec)
      found.push({ namespace: namespace ?? undefined, spec, name, range, line })
    } catch {
      // reported by the inspection
    }
  }
  return found
}

export type PikkuCallProperty = {
  name: string
  valueStart: number
  valueEnd: number
  propStart: number
  propEnd: number
}

export type PikkuCall = {
  found: boolean
  wrapperName?: string
  objectEnd?: number
  properties: PikkuCallProperty[]
  funcProperty: { valueStart: number; valueEnd: number } | null
}

/** Where the config object of `export const <exportedName> = pikku…({…})` and each of its properties sit, as UTF-16 offsets into `content`. */
export const findPikkuCall = (
  content: string,
  exportedName: string
): PikkuCall => callSync('findPikkuCall', { content, exportedName })

export type ImportInfo = {
  module: string
  names: string[]
  insertAt: number | null
  end: number
}

/** Every import declaration of `content` in source order, with where a named import would be added and where the last one ends. */
export const readImports = (
  content: string
): { lastImportEnd: number; imports: ImportInfo[] } =>
  callSync('readImports', { content })

export type MessageSite = { file: string; line: number; text: string }

export type MessageUsage = {
  keys: string[]
  usedIn: { key: string; files: string[] }[]
  computed: MessageSite[]
  unparsed: string[]
  files: number
}

/** Every Paraglide message key the `.ts`/`.tsx` files under `root` reference, and the places the namespace is read without naming one. */
export const scanMessageUsage = (root: string): MessageUsage =>
  callSync('scanMessageUsage', { root })

export type SourceHit = { file: string; line: number; text: string }

export type AsI18nArgumentHit = SourceHit & { kind: string }

export type AsI18nStubHit = SourceHit & { copy: string }

export type SepArgumentHit = SourceHit & { reason: string }

export type JsxLiteralPropHit = SourceHit & { via: string }

/** Every `asI18n(...)` call under `dir` whose first argument is not a plain variable reference. */
export const scanAsI18nArguments = (dir: string): AsI18nArgumentHit[] =>
  callSync('scanAsI18nArguments', { dir })

/** Every `asI18nStub(...)` call under `dir`, with its first argument trimmed to 60 characters. */
export const scanAsI18nStubs = (dir: string): AsI18nStubHit[] =>
  callSync('scanAsI18nStubs', { dir })

/** Every `sep(...)` call under `dir`, bound to `@pikku/react`, whose argument is not a non-empty run of whitespace, punctuation and symbols. */
export const scanSepArguments = (dir: string): SepArgumentHit[] =>
  callSync('scanSepArguments', { dir })

/** Bare text and string-literal children of JSX under `dir`; `gated` skips lowercase DOM and SVG elements. */
export const scanJsxLiteralText = (
  dir: string,
  allowed: readonly string[],
  gated: boolean
): SourceHit[] => callSync('scanJsxLiteralText', { dir, allowed, gated })

/** Copy written in JSX props, child expressions and helper-call arguments under `dir`. */
export const scanJsxLiteralProps = (
  dir: string,
  options: {
    allowed: readonly string[]
    props: readonly string[]
    helpers: readonly string[]
    gated: boolean
  }
): JsxLiteralPropHit[] => callSync('scanJsxLiteralProps', { dir, ...options })

/** English written as string and template literals in `.ts`/`.tsx` under `dir`, outside JSX. */
export const scanStringLiteralCopy = (
  dir: string,
  copyHelpers: readonly string[]
): SourceHit[] => callSync('scanStringLiteralCopy', { dir, copyHelpers })

export const readTsconfigOutDir = (tsconfig: string): string | undefined =>
  callSync<string | null>('readTsconfigOutDir', { tsconfig }) ?? undefined

export type CollectSurfaceOptions = {
  importsSubpath?: string
  subpaths?: string[]
  snippets?: Map<string, string>
  ownMembers?: boolean
}

/**
 * collectSurface from `@pikku/inspector/surface`. An `@example snippet:`
 * naming an unknown snippet rejects with an error named UnknownSnippetError.
 */
export const collectSurface = (
  packageDir: string,
  { importsSubpath, subpaths, snippets, ownMembers }: CollectSurfaceOptions = {}
): Promise<SurfaceEntrypoint[]> =>
  call('collectSurface', {
    packageDir,
    importsSubpath,
    subpaths,
    snippets: snippets ? [...snippets] : undefined,
    ownMembers,
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
