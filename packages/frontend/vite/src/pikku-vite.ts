import type { PluginOption } from 'vite'
import { readPikkuViteProject } from './pikku-config.js'
import { testIds } from './test-ids.js'

export interface PikkuViteOptions {
  /** Where to start looking for `pikku.config.json`. Defaults to the directory vite runs in. */
  from?: string
}

/**
 * The Pikku plugins a frontend needs, chosen from `pikku.config.json`:
 *
 * - `testIds()` always — scenarios drive built apps, not only the dev server.
 * - the Better Auth cross-site session relay when the project declares Better
 *   Auth (dev server only; see `@pikku/better-auth/vite`).
 *
 * ```ts
 * export default defineConfig({ plugins: [tanstackStart(), pikkuVite(), react()] })
 * ```
 */
export const pikkuVite = (options: PikkuViteOptions = {}): PluginOption[] => {
  const project = readPikkuViteProject(options.from)
  const plugins: PluginOption[] = [testIds()]
  if (project?.betterAuth) {
    // Loaded on demand: a project without Better Auth need not have it installed.
    plugins.push(
      import('@pikku/better-auth/vite').then(({ crossSiteSession }) =>
        crossSiteSession({ envFile: project.envFile })
      )
    )
  }
  return plugins
}
