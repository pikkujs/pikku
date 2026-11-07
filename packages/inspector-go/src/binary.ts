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
  'linux-x64',
  'linux-arm64',
  'win32-x64',
] as const

/** The inspectors that speak the protocol: `go` is `pikku-inspect`, `rs` is `pikku-inspect-rs`. */
export type InspectorEngine = 'go' | 'rs'

export const INSPECTOR_ENGINES: readonly InspectorEngine[] = ['go', 'rs']

type EngineInfo = {
  executable: string
  /** The environment variable that points at this engine's binary. */
  binEnv: string
  /** The `process.platform-process.arch` pairs it ships a prebuilt binary for. */
  platforms: readonly string[]
}

export const ENGINES: Record<InspectorEngine, EngineInfo> = {
  go: {
    executable: 'pikku-inspect',
    binEnv: 'PIKKU_INSPECTOR_GO_BIN',
    platforms: SUPPORTED_PLATFORMS,
  },
  rs: {
    executable: 'pikku-inspect-rs',
    binEnv: 'PIKKU_INSPECTOR_RS_BIN',
    platforms: ['darwin-arm64', 'linux-x64', 'linux-arm64'],
  },
}

export const executableName = (
  platform: string = process.platform,
  engine: InspectorEngine = 'go'
): string => {
  const name = ENGINES[engine].executable
  return platform === 'win32' ? `${name}.exe` : name
}

export const isInspectorEngine = (value: unknown): value is InspectorEngine =>
  typeof value === 'string' && (INSPECTOR_ENGINES as readonly string[]).includes(value)

let selectedEngine: InspectorEngine = 'go'

/**
 * The engine `findInspectorBinary` looks for when a call does not name one.
 * Choosing it (flag, environment, config, default) is the CLI's job; a program
 * that never calls this runs the Go reference.
 */
export const setInspectorEngine = (engine: InspectorEngine): void => {
  if (!isInspectorEngine(engine)) {
    throw new InspectorBinaryNotFoundError(
      `The inspector engine is "${engine}"; expected one of ${INSPECTOR_ENGINES.join(', ')}.`
    )
  }
  selectedEngine = engine
}

export const getInspectorEngine = (): InspectorEngine => selectedEngine

export interface FindInspectorBinaryOptions {
  /** Which inspector to find; the one set by setInspectorEngine by default. */
  engine?: InspectorEngine
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

/**
 * This package's root, built at runtime. A literal `new URL('…', import.meta.url)`
 * is read by webpack as an asset to bundle, which fails for a directory that
 * exists only after a release build, and the console addon is bundled into
 * Next.js apps.
 */
export const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

const PREBUILT_DIR = join(PACKAGE_DIR, 'prebuilt')

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

const notFoundMessage = (
  engine: InspectorEngine,
  platform: string,
  arch: string
): string => {
  const { executable, binEnv, platforms } = ENGINES[engine]
  const target = `${platform}-${arch}`
  const build =
    engine === 'go'
      ? `\`go build ./cmd/pikku-inspect\` in @pikku/inspector-go`
      : `\`cargo build --release\` in packages/inspector-rust`
  const hint = platforms.includes(target)
    ? `@pikku/inspector-go is missing prebuilt/${target}; reinstall it.`
    : `There is no prebuilt binary for ${target} (prebuilt: ` +
      `${platforms.join(', ')}). Build one with ${build} and point ` +
      `${binEnv} at it.`
  return (
    `No ${executable} binary found for ${target}. ${hint} ` +
    `Alternatively set ${binEnv} to a ${executable} binary.`
  )
}

/**
 * Finds the selected engine's binary (`pikku-inspect` or `pikku-inspect-rs`):
 * its `PIKKU_INSPECTOR_GO_BIN` / `PIKKU_INSPECTOR_RS_BIN` first, then the
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
  const engine = options.engine ?? selectedEngine
  const executable = executableName(platform, engine)
  const { binEnv } = ENGINES[engine]

  const override = env[binEnv]
  if (override) {
    if (!exists(override)) {
      throw new InspectorBinaryNotFoundError(
        `${binEnv} is set to ${override}, which does not exist.`
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

  const local = options.localBinary ?? join(PACKAGE_DIR, 'bin', executable)
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

  throw new InspectorBinaryNotFoundError(
    notFoundMessage(engine, platform, arch)
  )
}
