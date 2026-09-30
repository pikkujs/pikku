import { stat } from 'node:fs/promises'
import type { PikkuCLIConfig } from '../../types/config.js'
import { join } from 'node:path'
import { NATIVE_PROJECT_DIR } from '@pikku/deploy-standalone/native'

/**
 * Throw unless `dir` holds a built frontend.
 *
 * Both serving and deploying read a frontend's output rather than producing it,
 * so an unbuilt directory is the one failure mode the config invites, and it is
 * silent everywhere it is not caught: a server boots fine and answers every
 * page with a 404, and a deploy ships a binary with nothing inside it.
 */
export async function assertFrontendBuilt(dir: string): Promise<void> {
  try {
    await stat(join(dir, 'index.html'))
  } catch {
    throw new Error(
      `No frontend build found at ${dir} — pikku serves your frontend's output and never builds it, so run the frontend's build first (or drop "serve" from that frontend in pikku.config.json).`
    )
  }
}

/** The frontend the pikku server serves: its built output and where it mounts. */
export type ServedFrontend = {
  name: string
  dir: string
  urlPrefix: string
  spaFallback: boolean
}

/**
 * The one frontend in `frontends` that sets `serve`, if any.
 *
 * Config resolution already refuses a second one, so this never has to choose.
 */
export function servedFrontend(
  frontends: PikkuCLIConfig['frontends']
): ServedFrontend | undefined {
  for (const [name, frontend] of Object.entries(frontends ?? {})) {
    if (frontend.serve) {
      return { name, dir: frontend.dist, ...frontend.serve }
    }
  }
  return undefined
}

/**
 * The native projects that ship the compiled server as their sidecar — every
 * frontend whose `native.bundleServer` is set. A standalone bun deploy installs
 * into each; nothing on the command line asks for it.
 */
export function nativeSidecars(
  frontends: PikkuCLIConfig['frontends']
): Array<{ name: string; dir: string }> {
  return Object.entries(frontends ?? {})
    .filter(([, frontend]) => frontend.native?.bundleServer)
    .map(([name, frontend]) => ({
      name,
      dir: join(frontend.cwd, NATIVE_PROJECT_DIR),
    }))
}
