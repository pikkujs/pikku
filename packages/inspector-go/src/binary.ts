import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const EXECUTABLE =
  process.platform === 'win32' ? 'pikku-inspect.exe' : 'pikku-inspect'

/** The per-platform package that ships a prebuilt binary, esbuild style. */
export const platformPackageName = (
  platform: string = process.platform,
  arch: string = process.arch
): string => `@pikku/inspector-go-${platform}-${arch}`

const fromPlatformPackage = (): string | undefined => {
  const require = createRequire(import.meta.url)
  try {
    return require.resolve(`${platformPackageName()}/bin/${EXECUTABLE}`)
  } catch {
    return undefined
  }
}

const fromLocalBuild = (): string | undefined => {
  const local = fileURLToPath(new URL(`../bin/${EXECUTABLE}`, import.meta.url))
  return existsSync(local) ? local : undefined
}

export class InspectorBinaryNotFoundError extends Error {
  constructor() {
    super(
      `No pikku-inspect binary found. Set PIKKU_INSPECTOR_GO_BIN, install ` +
        `${platformPackageName()}, or run \`bun run build:go\` in @pikku/inspector-go.`
    )
    this.name = 'InspectorBinaryNotFoundError'
  }
}

/**
 * Finds the `pikku-inspect` binary: `PIKKU_INSPECTOR_GO_BIN` first, then the
 * installed per-platform package, then a binary built in this package.
 */
export const findInspectorBinary = (
  env: NodeJS.ProcessEnv = process.env
): string => {
  const binary =
    env.PIKKU_INSPECTOR_GO_BIN || fromPlatformPackage() || fromLocalBuild()
  if (!binary) {
    throw new InspectorBinaryNotFoundError()
  }
  return binary
}
