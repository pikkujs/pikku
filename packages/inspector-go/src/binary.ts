import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  realpathSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The `process.platform-process.arch` pairs with a prebuilt binary, each under
 * `prebuilt/<platform>-<arch>/` in this package. Mirrors scripts/platforms.mjs.
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

export interface FindInspectorBinaryOptions {
  platform?: string
  arch?: string
  /** Holds `<platform>-<arch>/pikku-inspect`; this package's `prebuilt/` by default. */
  prebuiltDir?: string
  /**
   * The running executable. A compiled `pikku` (Homebrew) has no prebuilt/,
   * so it looks for pikku-inspect beside itself; `process.execPath` by default.
   */
  execPath?: string
  /** The binary `bun run build:go` writes; this package's `bin/` by default. */
  localBinary?: string
  exists?: (path: string) => boolean
}

const PREBUILT_DIR = fileURLToPath(new URL('../prebuilt', import.meta.url))

/**
 * Package managers do not all keep a tarball's executable bit, so a prebuilt
 * binary that lost it gets it back on first use.
 */
const ensureExecutable = (path: string, platform: string): void => {
  if (platform === 'win32' || process.platform === 'win32') return
  try {
    accessSync(path, constants.X_OK)
  } catch {
    try {
      chmodSync(path, 0o755)
    } catch {
      // read-only install; running it reports the problem
    }
  }
}

export class InspectorBinaryNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InspectorBinaryNotFoundError'
  }
}

const notFoundMessage = (platform: string, arch: string): string => {
  const target = `${platform}-${arch}`
  const supported = (SUPPORTED_PLATFORMS as readonly string[]).includes(target)
  const hint = supported
    ? `@pikku/inspector-go is missing prebuilt/${target}; reinstall it.`
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
 * prebuilt one for this platform, then a binary built in this package, then
 * one beside the running executable (the compiled CLI).
 */
export const findInspectorBinary = (
  env: NodeJS.ProcessEnv = process.env,
  options: FindInspectorBinaryOptions = {}
): string => {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
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

  const prebuilt = join(
    options.prebuiltDir ?? PREBUILT_DIR,
    `${platform}-${arch}`,
    executable
  )
  if (exists(prebuilt)) {
    ensureExecutable(prebuilt, platform)
    return prebuilt
  }

  const local =
    options.localBinary ??
    fileURLToPath(new URL(`../bin/${executable}`, import.meta.url))
  if (exists(local)) return local

  const execPath = options.execPath ?? process.execPath
  const besides = [dirname(execPath)]
  try {
    besides.push(dirname(realpathSync(execPath)))
  } catch {
    // execPath is not on disk (a test); its own directory is enough
  }
  for (const dir of besides) {
    const beside = join(dir, executable)
    if (exists(beside)) return beside
  }

  throw new InspectorBinaryNotFoundError(notFoundMessage(platform, arch))
}
