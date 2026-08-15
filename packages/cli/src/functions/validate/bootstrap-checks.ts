import { join } from 'node:path'
import { readJsonSafe } from './shared-checks.js'
import type { ValidateFinding } from './persona-checks.js'

type PackageManifest = {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/**
 * `pikku dev` / `pikku serve` own the server lifecycle, so a project that boots
 * through them can hang setup off `pikkuServerLifecycle` instead of constructing
 * its own services. These patterns cover the runner prefixes people put in front
 * of the binary (npx/yarn/pnpm/bun), leading env assignments, and `&&` chains.
 */
const PIKKU_SERVER_SCRIPT =
  /(?:^|[\s;&|])pikku(?:\.js)?\s+(?:-[^\s]*\s+)*(?:dev|serve)(?:\s|$)/

/**
 * Scripts that hand off to another script rather than starting a process
 * themselves. We cannot follow the indirection, so they are treated as unknown
 * rather than reported.
 */
const DELEGATING_SCRIPT =
  /(?:^|[\s;&|])(?:turbo|nx|lerna|npm-run-all|run-p|run-s)(?:\s|$)|(?:^|[\s;&|])(?:npm|yarn|pnpm|bun)\s+(?:run|workspace|workspaces|--filter)(?:\s|$)/

/**
 * Runtime adapters that embed Pikku in a server the project owns. Depending on
 * one is a deliberate choice to bootstrap by hand — `pikku dev` / `pikku serve`
 * cannot host these, so their entrypoints are not reported.
 */
const RUNTIME_ADAPTER_PACKAGES = new Set([
  '@pikku/azure-functions',
  '@pikku/bun-server',
  '@pikku/cloudflare',
  '@pikku/express',
  '@pikku/express-middleware',
  '@pikku/fastify',
  '@pikku/fastify-plugin',
  '@pikku/lambda',
  '@pikku/modelcontextprotocol',
  '@pikku/next',
  '@pikku/node-http-server',
  '@pikku/tanstack-start',
  '@pikku/uws',
  '@pikku/uws-handler',
  '@pikku/ws',
])

async function hasRuntimeAdapter(
  root: string,
  rootPkg: PackageManifest
): Promise<boolean> {
  const fnPkg = await readJsonSafe<PackageManifest>(
    join(root, 'packages', 'functions', 'package.json')
  )
  const names = [
    ...Object.keys(rootPkg.dependencies ?? {}),
    ...Object.keys(rootPkg.devDependencies ?? {}),
    ...Object.keys(fnPkg?.dependencies ?? {}),
    ...Object.keys(fnPkg?.devDependencies ?? {}),
  ]
  return names.some((name) => RUNTIME_ADAPTER_PACKAGES.has(name))
}

type LintSeverity = 'off' | 'warn' | 'error'

function bootstrapLintSeverity(
  pikkuConfig: { lint?: unknown } | null
): LintSeverity {
  const lint = pikkuConfig?.lint as
    { customServerBootstrap?: unknown } | undefined
  const configured = lint?.customServerBootstrap
  return configured === 'off' || configured === 'error' || configured === 'warn'
    ? configured
    : 'warn'
}

/**
 * Reports a root `start`/`dev` script that boots a server Pikku does not own.
 *
 * Services built in a hand-rolled entrypoint never reach the
 * `pikkuServerLifecycle` hooks, so startup and shutdown work silently does not
 * run. A project depending on a runtime adapter has opted into owning its own
 * server, and a script that delegates to another runner cannot be followed, so
 * neither is reported.
 */
export async function runBootstrapChecks(
  root: string,
  rootPkg: PackageManifest | null,
  pikkuConfig: { lint?: unknown } | null
): Promise<ValidateFinding[]> {
  if (!rootPkg) return []

  const severity = bootstrapLintSeverity(pikkuConfig)
  if (severity === 'off') return []
  if (await hasRuntimeAdapter(root, rootPkg)) return []

  const customScripts = (['start', 'dev'] as const).filter((name) => {
    const script = rootPkg.scripts?.[name]
    if (!script) return false
    return !PIKKU_SERVER_SCRIPT.test(script) && !DELEGATING_SCRIPT.test(script)
  })
  if (customScripts.length === 0) return []

  const named = customScripts.map((n) => `"${n}"`).join(', ')
  return [
    {
      id: 'custom-server-bootstrap',
      severity,
      message: `package.json ${named} ${customScripts.length > 1 ? 'scripts start a server' : 'script starts a server'} without \`pikku dev\` or \`pikku serve\`, and no Pikku runtime adapter is installed — services created in a hand-rolled entrypoint bypass the server lifecycle hooks`,
      path: join(root, 'package.json'),
      fixHint:
        'Start the server with `pikku serve` (or `pikku dev` locally) and move startup and shutdown work into a `pikkuServerLifecycle({ beforeStart, afterStart, beforeStop, afterStop })` export, which receives the already-created singleton services. To keep a custom entrypoint, set "lint": { "customServerBootstrap": "off" } in pikku.config.json',
    },
  ]
}
