import { createServer } from 'node:net'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

import {
  spawnDevServer,
  type SpawnedServer,
} from '@pikku/cli/server/spawn-dev-server'
import { mockRegistryUrl } from '../src/mock-registry-server.js'

export interface StartBackendOptions {
  apiUrl?: string
}

/** Bind port 0, read what the OS handed out, hand it back. */
const findFreePort = (): Promise<number> =>
  new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (typeof address === 'string' || address === null) {
        probe.close(() => reject(new Error('could not resolve a free port')))
        return
      }
      probe.close(() => resolvePort(address.port))
    })
  })

/**
 * The defaults every e2e entry point runs under. `SCENARIO_ACTOR_SECRET` is
 * the root this app's actor sign-in route derives each persona's credential
 * from — long enough to be key material, or every sign-in is refused before it
 * is compared. `PIKKU_MOCK_LLM`
 * scripts the model instead of calling OpenAI, and `FABRIC_API_URL` points the
 * console's addon gallery at the catalogue this repo checks in rather than the
 * live Fabric registry — all three are this project's choices, not the
 * framework's, which is why they stay here.
 *
 * Opt out with PIKKU_MOCK_LLM=0 to run the @ai-live tier against a real key.
 */
export const applyTestEnvDefaults = (): void => {
  process.env.SCENARIO_ACTOR_SECRET ??=
    'e2e-actor-secret-long-enough-to-derive-from'
  process.env.PIKKU_MOCK_LLM ??= '1'
  process.env.FABRIC_API_URL ??= mockRegistryUrl
}

/**
 * Starts the backend and waits until it reports ready — which is after the
 * `afterStart` lifecycle has seeded users and scopes, so a sign-in immediately
 * afterwards cannot race the seed.
 *
 * Scenario runs do not come through here: `pikku scenario run --spawn` does the
 * same thing inside the CLI. What still needs it is `tests/cli/`, whose
 * node:test cases drive the CLI itself and so must bring their own server.
 *
 * The port is the OS's choice unless one is named. node:test runs files
 * concurrently, so a shared fixed port means whichever file starts second
 * fails on a port its sibling is legitimately holding. `API_URL` is exported
 * for the CLI subprocesses these tests spawn, which have to reach the same
 * server.
 */
export const startBackend = async (
  options: StartBackendOptions = {}
): Promise<SpawnedServer & { apiUrl: string }> => {
  const apiUrl = options.apiUrl ?? `http://localhost:${await findFreePort()}`
  const { port } = new URL(apiUrl)

  applyTestEnvDefaults()
  process.env.API_URL = apiUrl

  // The mock registry is started by the spawned server, so it collides on a
  // fixed port for the same reason the server does.
  if (!process.env.MOCK_REGISTRY_PORT) {
    const registryPort = await findFreePort()
    process.env.MOCK_REGISTRY_PORT = String(registryPort)
    process.env.FABRIC_API_URL = `http://localhost:${registryPort}`
  }

  const server = await spawnDevServer({
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    port: Number(port),
    coverage: true,
    env: { API_URL: apiUrl },
  })

  return { ...server, apiUrl }
}
