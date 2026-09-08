import { createRequire } from 'node:module'
import { join } from 'node:path'
import { SINGLE_FUNCTION_DIR } from '../functions/wirings/functions/serialize-function-imports.js'

export const SHARED_BOOTSTRAP_FILE = 'pikku-bootstrap-shared.gen.ts'

export const sharedBootstrapSpecifier = (packageName: string) =>
  `${packageName}/.pikku/${SHARED_BOOTSTRAP_FILE.replace(/\.ts$/, '.js')}`

export const singleFunctionSpecifier = (
  packageName: string,
  funcName: string
) => `${packageName}/.pikku/function/${SINGLE_FUNCTION_DIR}/${funcName}.gen.js`

/**
 * The bootstrap and per-function registration files an addon publishes when it
 * was built by a CLI that emits them, or `null` when it wasn't — an older build
 * ships the combined bootstrap alone and has to be imported whole.
 */
export const resolveSplitAddonImports = (
  rootDir: string,
  packageName: string,
  funcNames: string[]
): string[] | null => {
  if (funcNames.length === 0) {
    return null
  }
  const require = createRequire(join(rootDir, 'package.json'))
  const specifiers = [
    sharedBootstrapSpecifier(packageName),
    ...funcNames.map((funcName) =>
      singleFunctionSpecifier(packageName, funcName)
    ),
  ]
  for (const specifier of specifiers) {
    try {
      require.resolve(specifier)
    } catch {
      return null
    }
  }
  return specifiers
}
