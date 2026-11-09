import { join, resolve } from 'node:path'
import type { LocalContentConfig } from '@pikku/core/services/local-content'
import type { PikkuBackendInput } from '../../types/config.js'

/** The `content` block a backend writes in `pikku.config.json`, or `createConfig` returns. */
export type ContentSettings = NonNullable<PikkuBackendInput['content']>

/**
 * `pikku dev` and `pikku serve` build the content service themselves, so its
 * settings have to come from the project. The `pikku.config.json` block is the
 * one a project writes; a key set in `createConfig` wins, as it is computed at
 * boot and can differ per stage.
 */
export const resolveLocalContentConfig = ({
  appContent,
  backendContent,
  rootDir,
  runtimeDir,
  server,
}: {
  appContent: ContentSettings | undefined
  backendContent: ContentSettings | undefined
  rootDir: string
  runtimeDir: string | undefined
  server: string
}): LocalContentConfig => {
  // An app key left undefined must not wipe out the project's value.
  const settings: ContentSettings = { ...backendContent }
  for (const [key, value] of Object.entries(appContent ?? {})) {
    if (value !== undefined) (settings as Record<string, unknown>)[key] = value
  }
  return {
    localFileUploadPath: settings.contentPath
      ? resolve(rootDir, settings.contentPath)
      : join(
          runtimeDir
            ? resolve(rootDir, runtimeDir)
            : join(rootDir, '.pikku-runtime'),
          'content'
        ),
    uploadUrlPrefix: settings.uploadUrlPrefix ?? '/upload',
    assetUrlPrefix: settings.assetUrlPrefix ?? '/assets',
    server,
    sizeLimit: settings.sizeLimit,
  }
}

/**
 * The backend whose `content` block this process uses: the one named with
 * `--backend`, else the only one declared. Several declared and none named is
 * an error rather than a guess, because each backend keeps its own files.
 */
export const backendForContent = (
  backends: Record<string, { content?: ContentSettings }> | undefined,
  named: string | undefined,
  command: string
): { name: string | undefined; content: ContentSettings | undefined } => {
  const declared = Object.keys(backends ?? {})
  if (named) {
    if (!backends?.[named]) {
      throw new Error(
        `Unknown --backend '${named}'. Declared backends: ${declared.join(', ') || '(none)'}`
      )
    }
    return { name: named, content: backends[named]!.content }
  }
  if (declared.length > 1) {
    throw new Error(
      `${command} serves one backend and this project declares ${declared.length} (${declared.join(', ')}); name one with --backend.`
    )
  }
  const only = declared[0]
  return { name: only, content: only ? backends![only]!.content : undefined }
}
