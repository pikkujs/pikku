import type { StaticMount } from '@pikku/node-http-server'
import {
  assertFrontendBuilt,
  type ServedFrontend,
} from '../../utils/frontend.js'

/**
 * Turn the served frontend into the mount that serves it.
 *
 * The directory is checked rather than trusted because pikku only ever reads a
 * frontend's output: an unbuilt `dist` means the project's own build has not run,
 * and saying so here is far cheaper than a server that boots fine and answers
 * every page with a 404.
 */
export async function resolveFrontendMount(
  frontend: ServedFrontend
): Promise<StaticMount> {
  await assertFrontendBuilt(frontend.dir)

  return {
    urlPrefix: frontend.urlPrefix,
    directory: frontend.dir,
    spaFallback: frontend.spaFallback,
  }
}
