import { existsSync, readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const STATE_FILE = 'pikku-next.json'

export interface PikkuBump {
  from: string
  to: string
}

/** The @pikku/core this project resolves, walking up as node does. */
export function installedPikku(root: string): string | null {
  for (let dir = root; ; dir = dirname(dir)) {
    const manifest = join(dir, 'node_modules', '@pikku', 'core', 'package.json')
    if (existsSync(manifest))
      return (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string })
        .version
    if (dirname(dir) === dir) return null
  }
}

/**
 * The version `pikku changes next` last saw, kept beside the local changes queue. The
 * first sighting is recorded rather than reported: with nothing to compare to,
 * there is no bump.
 */
export async function takeBump(
  root: string,
  storePath: string
): Promise<PikkuBump | null> {
  const to = installedPikku(root)
  if (!to) return null
  const path = join(dirname(storePath), STATE_FILE)
  let state: { pikku?: string } = {}
  try {
    state = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (state.pikku === to) return null
  await writeFile(path, JSON.stringify({ ...state, pikku: to }, null, 2))
  return state.pikku ? { from: state.pikku, to } : null
}
