import { join } from 'node:path'
import { readJsonSafe } from './shared-checks.js'
import type { ValidateFinding } from './persona-checks.js'

/**
 * The packages the Node dev/serve path needs to speak WebSocket. Both are
 * optional peers of `@pikku/cli`, because Bun serves WebSockets natively
 * through `@pikku/bun-server` and a Bun project has no use for either.
 */
export const NODE_WEBSOCKET_PACKAGES = ['@pikku/ws', 'ws'] as const

export type WebsocketDepsInput = {
  root: string
  /** The runtime the CLI is running on. Bun needs neither package. */
  runtime: 'node' | 'bun'
  /** Whether the project wires any channels. Nothing is reported when not. */
  hasChannels: boolean
  /** Resolves a specifier from the project. `undefined` when not installed. */
  resolve: (specifier: string) => string | undefined
}

/**
 * Reports the optional WebSocket peers when a Node-hosted project that wires
 * channels is missing them.
 *
 * `pikku dev` / `pikku serve` under Node start over plain HTTP when the
 * packages are absent, rather than failing: a project with no channels does not
 * need them, and making them hard dependencies of the CLI is what put a second
 * `@pikku/core` in the tree. That leaves a project that *does* wire channels
 * with sockets that never connect and nothing pointing at the cause — which is
 * this check.
 */
export function runWebsocketDepsChecks(
  input: WebsocketDepsInput
): ValidateFinding[] {
  const { root, runtime, hasChannels, resolve } = input
  if (runtime === 'bun' || !hasChannels) return []

  const missing = NODE_WEBSOCKET_PACKAGES.filter((name) => !resolve(name))
  if (missing.length === 0) return []

  const named = missing.join(' and ')
  return [
    {
      id: 'websocket-deps-missing',
      severity: 'error',
      message: `${named} ${missing.length > 1 ? 'are' : 'is'} not installed, but this project wires channels — \`pikku dev\` and \`pikku serve\` will start without WebSocket support and every channel connection will fail`,
      path: join(root, 'package.json'),
      fixHint: `Install ${NODE_WEBSOCKET_PACKAGES.join(' ')} in this project. They are optional peer dependencies of @pikku/cli so that Bun projects, which serve WebSockets natively, do not pull them in`,
    },
  ]
}

/** True when codegen produced at least one channel for this project. */
export async function projectWiresChannels(
  root: string,
  outDir: string
): Promise<boolean> {
  const meta = await readJsonSafe<Record<string, unknown>>(
    join(root, outDir, 'channel', 'pikku-channels-meta.gen.json')
  )
  return !!meta && Object.keys(meta).length > 0
}
