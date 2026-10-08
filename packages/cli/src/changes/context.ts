import {
  LOCAL_PROJECT_ID,
  localChangesRPC,
  localStorePath,
  type ChangesRPC,
} from '../fabric/lib/changes-local.js'

export type { ChangesRPC }

export type ChangesContext = {
  rpc: ChangesRPC
  projectId: string
  storePath: string
}

export type ChangesBackend = (options: {
  apiUrl: string | undefined
  projectId: string | undefined
}) => Promise<Omit<ChangesContext, 'storePath'> | null>

const backends: ChangesBackend[] = []

/**
 * A backend claims a project it keeps the changes for, by returning a client
 * and the project's id, and returns null for one it does not. The first to
 * claim wins. A backend may throw, and the command then fails: a project that
 * a backend owns never falls through to the local file.
 */
export function registerChangesBackend(backend: ChangesBackend): void {
  backends.push(backend)
}

/** For tests: forget every registered backend. */
export function resetChangesBackends(): void {
  backends.length = 0
}

/**
 * Where this checkout's changes live: with a backend that claims the project,
 * else in the local file. Commands that only need the list call this and know
 * nothing about who keeps it.
 */
export async function changesContext(
  apiUrl: string | undefined,
  projectId?: string
): Promise<ChangesContext> {
  const storePath = await localStorePath()
  for (const backend of backends) {
    const claimed = await backend({ apiUrl, projectId })
    if (claimed) return { ...claimed, storePath }
  }
  return {
    rpc: localChangesRPC(storePath),
    projectId: LOCAL_PROJECT_ID,
    storePath,
  }
}
