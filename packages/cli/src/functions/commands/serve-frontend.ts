import type { StaticMount } from '@pikku/node-http-server'
import type { PikkuCLIConfig } from '../../../types/config.js'
import { assertFrontendBuilt } from '../../utils/frontend.js'

/**
 * Turn a resolved `frontend` config into the mount that serves it.
 *
 * The directory is checked rather than trusted because pikku only ever reads a
 * frontend's output: an unbuilt `dir` means the project's own build has not run,
 * and saying so here is far cheaper than a server that boots fine and answers
 * every page with a 404.
 */
export async function resolveFrontendMount(
  frontend: NonNullable<PikkuCLIConfig['frontend']>
): Promise<StaticMount> {
  await assertFrontendBuilt(frontend.dir)

  return {
    urlPrefix: frontend.urlPrefix,
    directory: frontend.dir,
    spaFallback: frontend.spaFallback,
  }
}
