import { dirname, join } from 'path'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'

// Get package version for generated file comments
const __dirname = dirname(fileURLToPath(import.meta.url))
let version = 'unknown'

try {
  // Try from src/ first (development), then from dist/src/ (built)
  const pkgPath = join(__dirname, '..', '..', 'package.json')
  const pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'))
  version = pkgJson.version
} catch {
  try {
    const pkgPath = join(__dirname, '..', '..', '..', 'package.json')
    const pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'))
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
