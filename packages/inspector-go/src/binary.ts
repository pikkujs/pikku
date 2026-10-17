import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/**
 * The `process.platform-process.arch` pairs with a prebuilt binary, one
 * `@pikku/inspector-go-<platform>-<arch>` package each. Mirrors
 * scripts/platforms.mjs.
 */
export const SUPPORTED_PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-x64',
  'linux-arm64',
  'win32-x64',
] as const

export const executableName = (platform: string = process.platform): string =>
  platform === 'win32' ? 'pikku-inspect.exe' : 'pikku-inspect'

/** The per-platform package that ships a prebuilt binary, esbuild style. */
export const platformPackageName = (
  platform: string = process.platform,
  arch: string = process.arch
): string => `@pikku/inspector-go-${platform}-${arch}`

export interface FindInspectorBinaryOptions {
  platform?: string
  arch?: string
  /** Resolves a module specifier to a file; `require.resolve` by default. */
  resolve?: (specifier: string) => string
  /** The binary `bun run build:go` writes; this package's `bin/` by default. */
  localBinary?: string
  exists?: (path: string) => boolean
}

const defaultResolve = (specifier: string): string =>
  createRequire(import.meta.url).resolve(specifier)

export class InspectorBinaryNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InspectorBinaryNotFoundError'
  }
}

const notFoundMessage = (platform: string, arch: string): string => {
  const target = `${platform}-${arch}`
  const pkg = platformPackageName(platform, arch)
  const supported = (SUPPORTED_PLATFORMS as readonly string[]).includes(target)
  const hint = supported
    ? `${pkg} is not installed. It is an optional dependency of ` +
      `@pikku/inspector-go, so it is skipped by \`--no-optional\`/` +
      `\`--omit=optional\`, or when the lockfile was written on another ` +
      `platform; reinstall with optional dependencies.`
    : `There is no prebuilt binary for ${target} (prebuilt: ` +
      `${SUPPORTED_PLATFORMS.join(', ')}). Build one with \`go build ` +
      `./cmd/pikku-inspect\` in @pikku/inspector-go and point ` +
      `PIKKU_INSPECTOR_GO_BIN at it.`
  return (
    `No pikku-inspect binary found for ${target}. ${hint} ` +
    `Alternatively set PIKKU_INSPECTOR_GO_BIN to a pikku-inspect binary, or ` +
    `use the TypeScript inspector instead: set "inspector": "typescript" in ` +
    `pikku.config.json, pass --inspector typescript, or set ` +
    `PIKKU_INSPECTOR=typescript.`
  )
}

/**
 * Finds the `pikku-inspect` binary: `PIKKU_INSPECTOR_GO_BIN` first, then the
 * installed per-platform package, then a binary built in this package.
 */
export const findInspectorBinary = (
  env: NodeJS.ProcessEnv = process.env,
  options: FindInspectorBinaryOptions = {}
): string => {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const resolve = options.resolve ?? defaultResolve
  const exists = options.exists ?? existsSync
  const executable = executableName(platform)

  const override = env.PIKKU_INSPECTOR_GO_BIN
  if (override) {
    if (!exists(override)) {
      throw new InspectorBinaryNotFoundError(
        `PIKKU_INSPECTOR_GO_BIN is set to ${override}, which does not exist.`
      )
    }
    return override
  }

  try {
    const installed = resolve(
      `${platformPackageName(platform, arch)}/bin/${executable}`
    )
    if (exists(installed)) return installed
  } catch {
    // not installed for this platform; fall through to a local build
  }

  const local =
    options.localBinary ??
    fileURLToPath(new URL(`../bin/${executable}`, import.meta.url))
  if (exists(local)) return local

  throw new InspectorBinaryNotFoundError(notFoundMessage(platform, arch))
}
