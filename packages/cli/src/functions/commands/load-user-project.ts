import { existsSync } from 'fs'
import { join } from 'path'
import { register } from 'tsx/esm/api'

let tsxRegistered = false

/**
 * Globally register tsx so subsequent `import()` calls go through Node's
 * normal resolver — yielding ONE module graph (and one shared pikkuState),
 * with tsx only stepping in to compile `.ts` and rewrite `.js → .ts`.
 *
 * `tsImport` from tsx/esm/api creates a fresh, isolated loader per call, so
 * modules imported through it have a different identity than modules already
 * loaded in the CLI process — that breaks anything that relies on shared
 * module state (e.g. `pikkuState` registrations from wireHTTPRoutes).
 */
function ensureTsxRegistered(): void {
  if (tsxRegistered) return
  register()
  tsxRegistered = true
}

/**
 * Load the generated `pikku-bootstrap.gen.{ts,js}` from the user's project,
 * which in turn pulls in all wiring/meta files so they register into
 * `pikkuState`.
 */
export async function loadUserBootstrap(pikkuDir: string): Promise<void> {
  ensureTsxRegistered()
  const bootstrapTs = join(pikkuDir, 'pikku-bootstrap.gen.ts')
  const bootstrapJs = join(pikkuDir, 'pikku-bootstrap.gen.js')
  const bootstrapPath = existsSync(bootstrapTs) ? bootstrapTs : bootstrapJs
  await import(bootstrapPath)
}

/**
 * Import a user-source TypeScript file (e.g. their config or services
 * factory) so it can be loaded from inside @pikku/cli's compiled JS.
 */
export async function loadUserModule(
  filePath: string
): Promise<Record<string, any>> {
  ensureTsxRegistered()
  return import(filePath)
}
