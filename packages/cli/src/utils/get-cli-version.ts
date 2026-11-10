import { dirname, join } from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

// Get package version for generated file comments. Read synchronously: this
// module sits in the import graph of `@pikku/cli/addon-support`, which addon
// schema files import, and the Rust inspector evaluates that graph in QuickJS,
// where a top-level `await` in a shared module deadlocks the second import
// that reaches it.
const __dirname = dirname(fileURLToPath(import.meta.url))
let version = 'unknown'

try {
  // Try from src/ first (development), then from dist/src/ (built)
  const pkgPath = join(__dirname, '..', '..', 'package.json')
  const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  version = pkgJson.version
} catch {
  try {
    const pkgPath = join(__dirname, '..', '..', '..', 'package.json')
    const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    version = pkgJson.version
  } catch {
    // Fallback to unknown if package.json can't be found
  }
}

/**
 * Returns the CLI version string
 * Works from both src/ and dist/src/ locations
 */
export const getCLIVersion = () => version
