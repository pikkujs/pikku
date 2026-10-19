import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { ADDONS_LOCK_FILE } from '@pikku/inspector/lite'
import {
  DEFAULT_ADDON_REGISTRY,
  RemoteAddonSyncError,
  collectRemoteAddonSdkSpecs,
  createRegistryClient,
  resolveRegistryToken,
  syncRemoteAddonSdks,
  type DownloadSdk,
  type ResolveSdk,
  type SyncLogger,
  type SyncResult,
} from '../../utils/remote-addon-sync.js'

export type AddonSyncConfig = {
  rootDir: string
  srcDirectories: string[]
  ignoreFiles?: string[]
  registry?: string
}

/**
 * Finds the project's versioned `wireRemoteAddon` packages and syncs their
 * SDKs. Null when the project has none and no lock, so nothing ran. The
 * registry client is built only when a spec needs the network.
 */
export const runAddonSync = async ({
  config,
  logger,
  client,
}: {
  config: AddonSyncConfig
  logger: SyncLogger
  client?: { resolveSdk: ResolveSdk; download: DownloadSdk }
}): Promise<SyncResult | null> => {
  const specs = await collectRemoteAddonSdkSpecs({
    ...config,
    ignoreFiles: config.ignoreFiles ?? [],
  })
  if (
    specs.length === 0 &&
    !existsSync(join(config.rootDir, ADDONS_LOCK_FILE))
  ) {
    return null
  }
  let lazy: { resolveSdk: ResolveSdk; download: DownloadSdk } | undefined =
    client
  const registry = async () =>
    (lazy ??= createRegistryClient({
      registry: config.registry ?? DEFAULT_ADDON_REGISTRY,
      token: await resolveRegistryToken(),
    }))
  return syncRemoteAddonSdks({
    rootDir: config.rootDir,
    specs,
    resolveSdk: async (request) => (await registry()).resolveSdk(request),
    download: async (url) => (await registry()).download(url),
    logger,
  })
}

export const pikkuAddonSync = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    let result: SyncResult | null
    try {
      result = await runAddonSync({ config, logger })
    } catch (e) {
      if (e instanceof RemoteAddonSyncError) {
        logger.critical(e.code, e.message)
        return
      }
      throw e
    }
    if (!result) {
      logger.info('No versioned wireRemoteAddon packages to sync.')
      return
    }
    for (const sdk of result.sdks) {
      logger.info(
        `${sdk.name}@${sdk.range} → ${sdk.version}${sdk.source === 'cached' ? '' : ' (downloaded)'}`
      )
    }
    if (result.lockChanged) {
      logger.info(`Wrote ${ADDONS_LOCK_FILE}`)
    }
  },
})
