/**
 * The read-only source helpers the CLI runs outside an inspection, answered
 * by the `pikku-inspect` binary.
 */
export {
  collectSurface,
  readTsconfigOutDir,
  scanFrontend,
} from '@pikku/inspector-go'
import * as go from '@pikku/inspector-go'

type SourceFile = { fileName: string; content: string }

/** readJsxLiteralText for each file, in one binary call. */
export const readJsxLiteralTextOf = (
  files: SourceFile[]
): ReturnType<typeof go.readJsxLiteralTextBatch> =>
  go.readJsxLiteralTextBatch(files)

/** readModuleSpecifiers for each file, in one binary call. */
export const readModuleSpecifiersOf = (files: SourceFile[]): string[][] =>
  go.readModuleSpecifiersBatch(files)
