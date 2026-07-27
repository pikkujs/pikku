import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

import {
  spawnDevServer,
  type SpawnedServer,
} from '@pikku/cli/server/spawn-dev-server'
import { mockRegistryUrl } from '../src/mock-registry-server.js'

const DEFAULT_API_URL = process.env.API_URL || 'http://localhost:4077'

export interface StartBackendOptions {
  apiUrl?: string
}

/**
 * The defaults every e2e entry point runs under. `SCENARIO_ACTOR_SECRET` is
 * the shared secret this app's actor sign-in route checks, `PIKKU_MOCK_LLM`
 * scripts the model instead of calling OpenAI, and `FABRIC_API_URL` points the
 * console's addon gallery at the catalogue this repo checks in rather than the
 * live Fabric registry — all three are this project's choices, not the
 * framework's, which is why they stay here.
 *
 * Opt out with PIKKU_MOCK_LLM=0 to run the @ai-live tier against a real key.
 */
export const applyTestEnvDefaults = (): void => {
  process.env.SCENARIO_ACTOR_SECRET ??= 'e2e-actor-secret'
  process.env.PIKKU_MOCK_LLM ??= '1'
  process.env.FABRIC_API_URL ??= mockRegistryUrl
}

/**
 * Starts the backend for the cucumber suite and waits until it reports ready —
 * which is after the `afterStart` lifecycle has seeded users and scopes, so a
 * sign-in immediately afterwards cannot race the seed.
 *
 * Scenario runs do not come through here: `pikku scenario run --spawn` does the
 * same thing inside the CLI. This exists only for as long as cucumber does.
 */
export const startBackend = async (
  options: StartBackendOptions = {}
): Promise<SpawnedServer & { apiUrl: string }> => {
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL
  const { port } = new URL(apiUrl)

  applyTestEnvDefaults()

  const server = await spawnDevServer({
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    port: Number(port),
    coverage: true,
    env: { API_URL: apiUrl },
  })

  return { ...server, apiUrl }
}
