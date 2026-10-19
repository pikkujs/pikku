import type { PlatformServiceContributor } from '@pikku/deploy'
import type { InspectorState } from '@pikku/inspector'
import type { Config } from '../../../types/application-types.js'
import {
  addonContributorRefs,
  loadDevContributors,
} from '../wirings/cli/write-dev-platform-services.js'

/**
 * The contributors `pikku deploy plan` / `apply` hand the provider adapter:
 * the project's `deploy.contributors`, then the ones each wired addon declares
 * in its package.json. The adapter orders them by `needs`/`provides`.
 */
export const loadDeployContributors = async (
  config: Pick<Config, 'rootDir' | 'deploy'>,
  state: Pick<InspectorState, 'addonContributors'>
): Promise<PlatformServiceContributor[]> =>
  loadDevContributors(
    config.rootDir,
    [...(config.deploy?.contributors ?? []), ...addonContributorRefs(state)],
    'deploy.contributors'
  )
