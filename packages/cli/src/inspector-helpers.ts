import {
  readJsxLiteralText as readJsxLiteralTextTS,
  readModuleSpecifiers as readModuleSpecifiersTS,
  readTsconfigOutDir as readTsconfigOutDirTS,
} from '@pikku/inspector'
import { collectSurface as collectSurfaceTS } from '@pikku/inspector/surface'
import * as go from '@pikku/inspector-go'
import { scanFrontend as scanFrontendTS } from './functions/mocks/stub-scan.js'

import { getInspectorEngine } from './inspector-engine.js'

/**
 * The read-only source helpers the CLI runs outside an inspection, answered by
 * the engine this process resolved (see inspector-engine.ts): the
 * `pikku-inspect` binary under `native`, the TypeScript compiler API under
 * `typescript`.
 */
const useGo = (): boolean => getInspectorEngine() === 'native'

type SourceFile = { fileName: string; content: string }

/** readJsxLiteralText for each file, in one binary call under the native engine. */
export const readJsxLiteralTextOf = (
  files: SourceFile[]
): ReturnType<typeof readJsxLiteralTextTS>[] =>
  useGo()
    ? go.readJsxLiteralTextBatch(files)
    : files.map((f) => readJsxLiteralTextTS(f.fileName, f.content))

/** readModuleSpecifiers for each file, in one binary call under the native engine. */
export const readModuleSpecifiersOf = (files: SourceFile[]): string[][] =>
  useGo()
    ? go.readModuleSpecifiersBatch(files)
    : files.map((f) => readModuleSpecifiersTS(f.fileName, f.content))

export const readTsconfigOutDir: typeof readTsconfigOutDirTS = (tsconfig) =>
  useGo() ? go.readTsconfigOutDir(tsconfig) : readTsconfigOutDirTS(tsconfig)

export const collectSurface: typeof collectSurfaceTS = (packageDir, options) =>
  useGo()
    ? go.collectSurface(packageDir, options)
    : collectSurfaceTS(packageDir, options)

export const scanFrontend: typeof scanFrontendTS = (rootDir, files, client) =>
  useGo()
    ? go.scanFrontend(rootDir, files, client)
    : scanFrontendTS(rootDir, files, client)
