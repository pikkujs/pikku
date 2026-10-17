import { createRequire } from 'node:module'
import * as go from '@pikku/inspector-go'

import { getInspectorEngine } from './inspector-engine.js'
import type * as TypeScriptHelperModule from './inspector-helpers-ts.js'

type TypeScriptHelpers = typeof TypeScriptHelperModule

/**
 * The read-only source helpers the CLI runs outside an inspection, answered by
 * the engine this process resolved (see inspector-engine.ts): the
 * `pikku-inspect` binary under `native`, the TypeScript compiler API under
 * `typescript`.
 */
const useGo = (): boolean => getInspectorEngine() === 'native'

let typescriptHelpers: TypeScriptHelpers | undefined

/**
 * Loads the TypeScript side of these helpers. The CLI awaits it when it
 * settles on the `typescript` engine, so the native engine never loads the
 * compiler. A literal import(), so `bun --compile` bundles the module.
 */
export const loadTypeScriptHelpers = async (): Promise<void> => {
  typescriptHelpers ??= await import('./inspector-helpers-ts.js')
}

/**
 * A helper called before any engine was selected (a unit test, a script
 * calling it directly) loads the TypeScript side synchronously instead.
 */
const ts = (): TypeScriptHelpers =>
  (typescriptHelpers ??= createRequire(import.meta.url)(
    './inspector-helpers-ts.js'
  ) as TypeScriptHelpers)

type SourceFile = { fileName: string; content: string }

/** readJsxLiteralText for each file, in one binary call under the native engine. */
export const readJsxLiteralTextOf = (
  files: SourceFile[]
): ReturnType<TypeScriptHelpers['readJsxLiteralText']>[] =>
  useGo()
    ? go.readJsxLiteralTextBatch(files)
    : files.map((f) => ts().readJsxLiteralText(f.fileName, f.content))

/** readModuleSpecifiers for each file, in one binary call under the native engine. */
export const readModuleSpecifiersOf = (files: SourceFile[]): string[][] =>
  useGo()
    ? go.readModuleSpecifiersBatch(files)
    : files.map((f) => ts().readModuleSpecifiers(f.fileName, f.content))

export const readTsconfigOutDir: TypeScriptHelpers['readTsconfigOutDir'] = (
  tsconfig
) =>
  useGo() ? go.readTsconfigOutDir(tsconfig) : ts().readTsconfigOutDir(tsconfig)

export const collectSurface: TypeScriptHelpers['collectSurface'] = (
  packageDir,
  options
) =>
  useGo()
    ? go.collectSurface(packageDir, options)
    : ts().collectSurface(packageDir, options)

export const scanFrontend: TypeScriptHelpers['scanFrontend'] = (
  rootDir,
  files,
  client
) =>
  useGo()
    ? go.scanFrontend(rootDir, files, client)
    : ts().scanFrontend(rootDir, files, client)
