import { stat } from 'node:fs/promises'
import { join } from 'node:path'

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
      `No frontend build found at ${dir} — pikku serves your frontend's output and never builds it, so run the frontend's build first (or drop "frontend" from pikku.config.json).`
    )
  }
}
