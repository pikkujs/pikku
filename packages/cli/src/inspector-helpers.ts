import {
  readJsxLiteralText as readJsxLiteralTextTS,
  readModuleSpecifiers as readModuleSpecifiersTS,
  readTsconfigOutDir as readTsconfigOutDirTS,
} from '@pikku/inspector'
import { collectSurface as collectSurfaceTS } from '@pikku/inspector/surface'
import * as go from '@pikku/inspector-go'
import { scanFrontend as scanFrontendTS } from './functions/mocks/stub-scan.js'

/**
 * The read-only helpers the CLI runs outside an inspection, from the engine
 * PIKKU_INSPECTOR names (go|typescript, default typescript) — the same staging
 * switch services.ts reads for the inspector itself.
 */
const useGo = (): boolean => {
  const engine = process.env.PIKKU_INSPECTOR || 'typescript'
  if (engine === 'go') return true
  if (engine === 'typescript') return false
  throw new Error(
    `PIKKU_INSPECTOR must be 'go' or 'typescript', not '${engine}'`
  )
}

type SourceFile = { fileName: string; content: string }

/** readJsxLiteralText for each file, in one binary call under Go. */
export const readJsxLiteralTextOf = (
  files: SourceFile[]
): ReturnType<typeof readJsxLiteralTextTS>[] =>
  useGo()
    ? go.readJsxLiteralTextBatch(files)
    : files.map((f) => readJsxLiteralTextTS(f.fileName, f.content))

/** readModuleSpecifiers for each file, in one binary call under Go. */
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
