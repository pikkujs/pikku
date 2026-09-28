import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { readModuleSpecifiers } from '@pikku/inspector'
import { collectAppSources } from './app-sources.js'
import { readJsonSafe } from './shared-checks.js'
import type { ValidateFinding, ValidateSeverity } from './persona-checks.js'

/**
 * The one core subpath an app is meant to name.
 *
 * It holds concrete service implementations and the interfaces they satisfy —
 * `LocalSecretService`, `ConsoleLogger`, `JWTService`, `EmailService`. Picking
 * one of those is the same act as picking a package, and routing a choice
 * through a generated barrel would hide that it was a choice. Bootstrap code is
 * already outside the `#pikku` contract; it is where `process.env` is allowed
 * too.
 */
const ALLOWED_SUBPATHS = ['@pikku/core/services']

const isAllowed = (specifier: string) =>
  ALLOWED_SUBPATHS.some(
    (allowed) => specifier === allowed || specifier.startsWith(`${allowed}/`)
  )

const isCoreImport = (specifier: string) =>
  specifier === '@pikku/core' || specifier.startsWith('@pikku/core/')

/**
 * Which generated leaf carries the app-facing half of each core subpath.
 *
 * The leaf names are the ones `pikku all` writes an `index.ts` for, so a
 * suggestion here is a specifier the project can actually resolve. Subpaths
 * absent from this map are still reported — an app has no business naming them
 * either — but with no leaf to point at, because there is none: the name is
 * ecosystem surface an app reached for, or a gap in what the generator emits.
 */
const LEAF_FOR_SUBPATH = new Map<string, string>([
  ['@pikku/core/addon', 'addon'],
  ['@pikku/core/agent', 'agent'],
  ['@pikku/core/agent-scorer', 'agent'],
  ['@pikku/core/channel', 'channel'],
  ['@pikku/core/cli', 'cli'],
  ['@pikku/core/credential', 'credentials'],
  ['@pikku/core/errors', 'error'],
  ['@pikku/core/function', 'function'],
  ['@pikku/core/gateway', 'gateway'],
  ['@pikku/core/http', 'http'],
  ['@pikku/core/mcp', 'mcp'],
  ['@pikku/core/middleware', 'middleware'],
  ['@pikku/core/queue', 'queue'],
  ['@pikku/core/role', 'scopes'],
  ['@pikku/core/scheduler', 'scheduler'],
  ['@pikku/core/scope', 'scopes'],
  ['@pikku/core/secret', 'secrets'],
  ['@pikku/core/trigger', 'trigger'],
  ['@pikku/core/variable', 'variables'],
  ['@pikku/core/workflow', 'workflow'],
  ['@pikku/core/workflow/types', 'workflow'],
])

/** The subpaths whose app-facing half lives behind the scenario entry. */
const SCENARIO_SUBPATHS = new Set([
  '@pikku/core/persona',
  '@pikku/core/scenario',
])

type PackageManifest = { imports?: Record<string, unknown> }

/**
 * The scenario surface is the one leaf a project can name two ways: the
 * generated directory is `scenarios`, and a project may also map
 * `#pikku/scenario` straight at the types file. Reading the project's own
 * `imports` map means the suggestion is a specifier that resolves in *this*
 * project rather than the one the docs happen to use.
 */
const scenarioAlias = async (dir: string): Promise<string> => {
  const pkg = await readJsonSafe<PackageManifest>(join(dir, 'package.json'))
  return pkg?.imports && '#pikku/scenario' in pkg.imports
    ? '#pikku/scenario'
    : '#pikku/scenarios'
}

const severityFor = (
  pikkuConfig: { lint?: unknown } | null
): ValidateSeverity | 'off' => {
  const lint = pikkuConfig?.lint as { coreImport?: unknown } | undefined
  const configured = lint?.coreImport
  return configured === 'off' ||
    configured === 'error' ||
    configured === 'warn' ||
    configured === 'info'
    ? configured
    : 'error'
}

/**
 * `#pikku` is the app developer's public API; `@pikku/core` is the ecosystem's.
 *
 * The alias is generated against this project's own functions, personas and
 * scopes, so the name it hands over arrives already typed —
 * `wireQueueWorker` from `#pikku/queue` takes `QueueWiring<In, Out>` where the
 * core export takes `any`. Reaching past the alias into core is reaching for
 * the untyped copy of the same name, and it pins a subpath the app was never
 * promised: what core exports moves when the runtime needs it to, while the
 * alias is what the CLI keeps stable.
 */
export const runCoreImportChecks = async (
  dir: string
): Promise<ValidateFinding[]> => {
  const pikkuConfig = await readJsonSafe<{ lint?: unknown }>(
    join(dir, 'pikku.config.json')
  )
  const severity = severityFor(pikkuConfig)
  if (severity === 'off') return []

  const findings: ValidateFinding[] = []
  let scenarioEntry: string | undefined

  for (const file of await collectAppSources(dir)) {
    const content = await readFile(file, 'utf8')
    if (!content.includes('@pikku/core')) continue
    for (const specifier of readModuleSpecifiers(file, content)) {
      if (!isCoreImport(specifier) || isAllowed(specifier)) continue

      const leaf = LEAF_FOR_SUBPATH.get(specifier)
      const alias = SCENARIO_SUBPATHS.has(specifier)
        ? (scenarioEntry ??= await scenarioAlias(dir))
        : leaf && `#pikku/${leaf}`

      findings.push({
        id: 'core-import',
        severity,
        message: `${relative(dir, file)} imports '${specifier}' — an app reaches Pikku through the generated '#pikku' alias, which is typed against this project, while '@pikku/core' is the ecosystem surface and carries the untyped shape`,
        path: file,
        fixHint: alias
          ? `Import the same names from '${alias}'`
          : `Nothing in '#pikku' carries these names yet — that is a gap in what the CLI emits, so please open an issue naming them. '@pikku/core/services' is the one subpath an app may name, for the service implementations it picks in bootstrap. To keep the import meanwhile, set "lint": { "coreImport": "off" } in pikku.config.json`,
      })
    }
  }

  return findings
}
