import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import semver from 'semver'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  buildSdkFiles,
  readPackageInfo,
  sdkTarballName,
  type SdkManifest,
} from '../../../utils/addon-sdk.js'
import { packTarGz } from '../../../utils/sdk-tarball.js'
import { serializeSdkSources } from '../../../utils/addon-sdk-sources.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export type AddonSdkResult = {
  manifest: SdkManifest
  sdkDir: string
  tarball: string
} | null

/**
 * An addon's types-only SDK, cut by `pikku all` from the output it has just
 * generated: the five files into `.pikku/sdk/`, packed into
 * `<scope>-<name>-<version>.sdk.tgz` beside package.json at the package.json
 * version. The same contract always packs to the same bytes. An app gets
 * nothing; whether a contract change needed a version bump is
 * `pikku versions check`'s call, not this step's.
 *
 * knowledge: an-addon-sdk-ships-only-the-remote-surface
 */
export const pikkuAddonSdk = pikkuSessionlessFunc<void, AddonSdkResult>({
  func: async ({ logger, config, getInspectorState }) => {
    if (!config.addon) return null

    const info = readPackageInfo(join(config.rootDir, 'package.json'))
    if (!info.version || !semver.valid(info.version)) {
      logger.warn(
        `No addon SDK packed: package.json version '${info.version ?? ''}' is not a semver version.`
      )
      return null
    }
    if (!info.pikkuCore) {
      logger.warn(
        'No addon SDK packed: package.json declares no @pikku/core in peerDependencies or dependencies, so the SDK cannot state the core range it was built against.'
      )
      return null
    }

    const { files, manifest } = buildSdkFiles(
      serializeSdkSources(logger, await getInspectorState(), config),
      { name: info.name, version: info.version, pikkuCore: info.pikkuCore }
    )

    // An addon's outDir is `<outDir>/addon`; the SDK sits beside it.
    const sdkDir = join(dirname(config.outDir), 'sdk')
    rmSync(sdkDir, { recursive: true, force: true })
    for (const [path, content] of files) {
      const target = join(sdkDir, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content, 'utf-8')
    }

    const tarball = join(
      config.rootDir,
      sdkTarballName(info.name, info.version)
    )
    writeFileSync(
      tarball,
      packTarGz(
        [...files].map(([path, content]) => ({
          path,
          content: Buffer.from(content, 'utf-8'),
        }))
      )
    )
    logger.debug(
      `• Packed ${info.name}@${info.version} SDK (${files.size} files) into ${relative(config.rootDir, tarball)}`
    )
    return { manifest, sdkDir, tarball }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Packing addon SDK',
      commandEnd: 'Packed addon SDK',
    }),
  ],
})
