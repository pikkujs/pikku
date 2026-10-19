import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import semver from 'semver'
import { PikkuError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  buildSdkFiles,
  checkSdkBump,
  loadPreviousSdk,
  readPackageInfo,
  sdkTarballName,
  SDK_FUNCTIONS_META,
  SDK_SCHEMAS,
  type SdkBumpCheck,
  type SdkManifest,
} from '../../utils/addon-sdk.js'
import { packTarGz } from '../../utils/sdk-tarball.js'
import { serializeSdkSources } from '../../utils/addon-sdk-sources.js'

export type SdkInput = {
  version?: string
  bumpFrom?: string
  packDir?: string
}

export type SdkResult = {
  manifest: SdkManifest
  sdkDir: string
  tarball: string
  bump?: Omit<SdkBumpCheck, 'changes'> & { verdict: string }
}

/**
 * `pikku sdk` — cut an addon's types-only SDK from its generated output, into
 * `.pikku/sdk/` and a `<scope>-<name>-<version>.sdk.tgz` beside package.json.
 */
export const pikkuSdk = pikkuSessionlessFunc<SdkInput, SdkResult>({
  func: async ({ logger, config, getInspectorState }, input) => {
    const data = input ?? {}
    if (!config.addon) {
      throw new PikkuError(
        '`pikku sdk` packs an addon\'s contract. Set `"addon": true` in pikku.config.json, then run `pikku all` first.'
      )
    }

    const info = readPackageInfo(join(config.rootDir, 'package.json'))
    const version = data.version ?? info.version
    if (!version || !semver.valid(version)) {
      throw new PikkuError(
        `SDK version '${version ?? ''}' is not a semver version. Pass --version, or set "version" in package.json.`
      )
    }
    if (!info.pikkuCore) {
      throw new PikkuError(
        'package.json declares no @pikku/core in peerDependencies or dependencies, so the SDK cannot state the core range it was built against.'
      )
    }

    const { files, manifest } = buildSdkFiles(
      serializeSdkSources(logger, await getInspectorState(), config),
      { name: info.name, version, pikkuCore: info.pikkuCore }
    )

    let bump: SdkResult['bump']
    if (data.bumpFrom) {
      const source = resolve(config.rootDir, data.bumpFrom)
      const check = checkSdkBump(
        loadPreviousSdk(source),
        {
          functions: JSON.parse(files.get(SDK_FUNCTIONS_META)!),
          schemas: JSON.parse(files.get(SDK_SCHEMAS)!),
        },
        version,
        data.bumpFrom
      )
      bump = {
        previousVersion: check.previousVersion,
        requiredVersion: check.requiredVersion,
        verdict: check.changes.verdict,
      }
      logger.info(
        `Contract change since ${check.previousVersion} is ${check.changes.verdict}; ${version} satisfies the required ${check.requiredVersion}.`
      )
    }

    // An addon's outDir is `<outDir>/addon`; the SDK sits beside it.
    const sdkDir = join(dirname(config.outDir), 'sdk')
    rmSync(sdkDir, { recursive: true, force: true })
    for (const [path, content] of files) {
      const target = join(sdkDir, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content, 'utf-8')
    }

    const tarballDir = data.packDir
      ? resolve(config.rootDir, data.packDir)
      : config.rootDir
    mkdirSync(tarballDir, { recursive: true })
    const tarball = join(tarballDir, sdkTarballName(info.name, version))
    writeFileSync(
      tarball,
      packTarGz(
        [...files].map(([path, content]) => ({
          path,
          content: Buffer.from(content, 'utf-8'),
        }))
      )
    )

    logger.info(
      `Packed ${info.name}@${version} SDK (${files.size} files) into ${relative(config.rootDir, tarball) || tarball}`
    )
    return { manifest, sdkDir, tarball, bump }
  },
})
