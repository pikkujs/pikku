/**
 * The TypeScript-engine side of inspector-helpers.ts. Everything here loads
 * the TypeScript compiler, so it is only imported once the `typescript` engine
 * is in use.
 */
export {
  readJsxLiteralText,
  readModuleSpecifiers,
  readTsconfigOutDir,
} from '@pikku/inspector'
export { collectSurface } from '@pikku/inspector/surface'
export { scanFrontend } from './functions/mocks/stub-scan-source.js'
