import { join, resolve } from 'node:path'
import type { LocalContentConfig } from '@pikku/core/services/local-content'
import type { PikkuCLIConfig } from '../../types/config.js'

/** The `content` block a project writes, in `pikku.config.json` or `createConfig`. */
export type ContentSettings = NonNullable<PikkuCLIConfig['content']>

/**
 * `pikku dev` and `pikku serve` build the content service themselves, so its
 * settings have to come from the project. The `pikku.config.json` block is the
 * one a project writes; a key set in `createConfig` wins, as it is computed at
 * boot and can differ per stage.
 */
export const resolveLocalContentConfig = ({
  appContent,
  projectContent,
  rootDir,
  runtimeDir,
  server,
}: {
  appContent: ContentSettings | undefined
  projectContent: ContentSettings | undefined
  rootDir: string
  runtimeDir: string | undefined
  server: string
}): LocalContentConfig => {
  const settings = { ...projectContent, ...appContent }
  return {
    localFileUploadPath: settings.contentPath
      ? resolve(rootDir, settings.contentPath)
      : join(runtimeDir ?? join(rootDir, '.pikku-runtime'), 'content'),
    uploadUrlPrefix: settings.uploadUrlPrefix ?? '/upload',
    assetUrlPrefix: settings.assetUrlPrefix ?? '/assets',
    server,
    sizeLimit: settings.sizeLimit,
  }
}
