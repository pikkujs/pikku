import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Logger } from '@pikku/core/services'
import type { PikkuCLIConfig } from '../../../types/config.js'
import { runLabelled } from '../../utils/run-labelled.js'
import type { AppBuildInput, AppBuildOutput } from './schemas.js'

type Frontends = PikkuCLIConfig['frontends']

const hasBuildScript = (cwd: string): boolean => {
  const file = join(cwd, 'package.json')
  if (!existsSync(file)) return false
  try {
    return !!JSON.parse(readFileSync(file, 'utf-8')).scripts?.build
  } catch {
    return false
  }
}

const selected = (
  frontend: NonNullable<Frontends>[string],
  { onlyServed, skipServed }: AppBuildInput
): boolean => {
  if (frontend.deploy === false) return false
  if (onlyServed && !frontend.serve) return false
  if (skipServed && frontend.serve) return false
  return true
}

/**
 * Build every deployed frontend with its own `build` script, in its own
 * directory and side by side. The root `build` script is not involved, so
 * whatever a project chained onto it does not run. Every app gets to finish:
 * one failure should not hide a second.
 */
export const runAppBuild = async (
  { logger, frontends }: { logger: Logger; frontends: Frontends },
  input: AppBuildInput
): Promise<AppBuildOutput> => {
  if (input.onlyServed && input.skipServed) {
    throw new Error('--only-served and --skip-served exclude each other')
  }
  const apps = await Promise.all(
    Object.entries(frontends ?? {})
      .filter(([, frontend]) => selected(frontend, input))
      .map(async ([name, frontend]) => {
        if (!hasBuildScript(frontend.cwd)) {
          logger.error(`[${name}] no "build" script in ${frontend.cwd}`)
          return { name, ok: false, failure: 'no build script' }
        }
        const run = await runLabelled(
          { logger, label: name },
          'bun',
          ['run', 'build'],
          { cwd: frontend.cwd }
        )
        if (!run.ok) logger.error(`[${name}] build failed: ${run.failure}`)
        return { name, ok: run.ok, failure: run.failure }
      })
  )
  if (apps.some((app) => !app.ok)) process.exitCode = 1
  return { apps }
}
