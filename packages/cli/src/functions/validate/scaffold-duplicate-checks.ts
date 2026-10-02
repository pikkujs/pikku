import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import { blankComments } from '../../fabric/lib/blank-comments.js'
import type { ValidateFinding } from './persona-checks.js'
import { applyRuleSeverity } from './rule-severity.js'

/**
 * Everything `pikku all` writes into the scaffold directory, keyed the way
 * `pikku-cli-config.ts` derives it: `<scaffold dir>/<dir>/<file>`.
 *
 * `field` is the top-level config field that overrides the path, `main` marks
 * the entry an explicit `scaffold.<feature>.path` names (its siblings follow
 * it). The retired scenarios and user-admin scaffolds are left out on purpose:
 * pikku no longer generates them, so they are not scaffold output any more.
 * scaffold-duplicate-checks.test.ts resolves a real config and fails if this
 * table and the resolver drift apart.
 */
export const SCAFFOLD_OUTPUTS: ReadonlyArray<{
  feature: string
  field: string
  dir: string
  file: string
  main: boolean
}> = [
  ['rpc', 'publicRpcFile', 'rpc', 'rpc-public.gen.ts', true],
  ['rpc', 'publicRpcSchemasFile', 'rpc', 'rpc-public.schemas.gen.ts', false],
  ['remoteRpc', 'remoteRpcWorkersFile', 'rpc', 'rpc-remote.gen.ts', true],
  [
    'remoteRpc',
    'remoteRpcSchemasFile',
    'rpc',
    'rpc-remote.schemas.gen.ts',
    false,
  ],
  ['graph', 'graphWiringsFile', 'graph', 'graph.wirings.gen.ts', true],
  ['webhook', 'webhookWorkersFile', 'webhook', 'webhook.gen.ts', true],
  ['webhook', 'webhookSchemasFile', 'webhook', 'webhook.schemas.gen.ts', false],
  ['remoteJobs', 'remoteJobsFile', 'remote-jobs', 'remote-jobs.gen.ts', true],
  [
    'workflow',
    'workflowRoutesFile',
    'workflow',
    'workflow-routes.gen.ts',
    true,
  ],
  [
    'workflow',
    'workflowRoutesSchemasFile',
    'workflow',
    'workflow-routes.schemas.gen.ts',
    false,
  ],
  ['analytics', 'analyticsFile', 'analytics', 'analytics.gen.ts', true],
  [
    'featureFlags',
    'featureFlagsFile',
    'feature-flags',
    'feature-flags.gen.ts',
    true,
  ],
  ['agent', 'publicAgentFile', 'agent', 'agent.gen.ts', true],
  ['agent', 'publicAgentSchemasFile', 'agent', 'agent.schemas.gen.ts', false],
  ['console', 'consoleFunctionsFile', 'console', 'console.gen.ts', true],
  ['console', 'consoleSchemasFile', 'console', 'console.schemas.gen.ts', false],
  [
    'virtualUser',
    'virtualUserFunctionsFile',
    'virtual-user',
    'virtual-user.gen.ts',
    true,
  ],
  [
    'virtualUser',
    'virtualUserSchemasFile',
    'virtual-user',
    'virtual-user.schemas.gen.ts',
    false,
  ],
  ['events', 'eventsChannelFile', 'realtime', 'events.gen.ts', true],
  ['events', 'eventsSchemasFile', 'realtime', 'events.schemas.gen.ts', false],
  ['auth', 'authFile', 'auth', 'auth.gen.ts', true],
  ['auth', '', 'auth', 'auth-secrets.gen.ts', false],
  ['auth', '', 'auth', 'auth-middleware.gen.ts', false],
].map(([feature, field, dir, file, main]) => ({
  feature: feature as string,
  field: field as string,
  dir: dir as string,
  file: file as string,
  main: main as boolean,
}))

/**
 * Addons a scaffold feature wires itself. Used when the scaffold file has not
 * been generated yet; a generated one is read directly (see `wiredAddons`).
 */
const SCAFFOLD_ADDONS: Record<string, { name: string; package: string }> = {
  console: { name: 'console', package: '@pikku/addon-console' },
  graph: { name: 'graph', package: '@pikku/addon-graph' },
}

type ScaffoldCheckConfig = {
  rootDir?: unknown
  srcDirectories?: unknown
  scaffold?: Record<string, unknown>
  validate?: { rules?: Record<string, unknown> }
  [field: string]: unknown
}

const SKIP_SEGMENTS = new Set(['node_modules', 'dist', 'build', 'coverage'])

const listTsFiles = async (dir: string): Promise<string[]> => {
  if (!existsSync(dir)) return []
  try {
    return (await readdir(dir, { recursive: true }))
      .filter(
        (f): f is string =>
          typeof f === 'string' &&
          f.endsWith('.ts') &&
          !f.endsWith('.d.ts') &&
          !f
            .split(/[\\/]/)
            .some((s) => SKIP_SEGMENTS.has(s) || s.startsWith('.'))
      )
      .map((f) => join(dir, f))
  } catch {
    return []
  }
}

const stringOrUndefined = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined

/**
 * The calls inside `text` that read `wireAddon({ ... })`, with the literal
 * `name` and `package` each declares. Comments are blanked first, so the prose
 * in a scaffold that names another addon is not a wiring.
 */
const wiredAddons = (
  text: string
): Array<{ name?: string; package?: string }> => {
  const source = blankComments(text)
  const calls: Array<{ name?: string; package?: string }> = []
  const re = /\bwireAddon\s*\(\s*\{/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    let depth = 1
    let i = match.index + match[0].length
    const start = i
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    const body = source.slice(start, i - 1)
    calls.push({
      name: /(?:^|[\s,])name\s*:\s*['"`]([^'"`]+)['"`]/.exec(body)?.[1],
      package: /(?:^|[\s,])package\s*:\s*['"`]([^'"`]+)['"`]/.exec(body)?.[1],
    })
  }
  return calls
}

/**
 * Scaffold output that also exists somewhere else in the project.
 *
 * A scaffold is generated, so it has one home: the scaffold directory
 * (`scaffold.pikkuDir`, or `<first srcDirectory>/scaffold`). A second copy
 * elsewhere is never read by `pikku all` — nothing regenerates it, nothing
 * deletes it — yet it is still project source, so it keeps registering its
 * wirings in the bundle after the feature was turned off, and tooling that
 * assumes the canonical location misses it. Two shapes are reported:
 *
 *  - a file `pikku all` generates for a scaffold feature sitting at any path
 *    other than the one it would be written to, whether or not the feature is
 *    still enabled (`scaffold-output-outside-scaffold-dir`);
 *  - a hand-written `wireAddon` for an addon the scaffold already wires
 *    (`scaffold-addon-declared-twice`). A `defineRoles` grant of the addon's
 *    scope is a different thing and is not touched.
 *
 * Reads the raw `pikku.config.json`, like every other validate check, so the
 * path defaults are repeated here rather than resolved.
 */
export const runScaffoldDuplicateChecks = async (
  root: string
): Promise<ValidateFinding[]> => {
  const findings: ValidateFinding[] = []
  let config: ScaffoldCheckConfig
  try {
    config = JSON.parse(await readFile(join(root, 'pikku.config.json'), 'utf8'))
  } catch {
    return findings
  }

  const configRoot = stringOrUndefined(config.rootDir)
    ? resolve(root, config.rootDir as string)
    : root
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(configRoot, p))
  const rel = (p: string) => relative(root, p) || '.'

  const srcDirs = (
    Array.isArray(config.srcDirectories) ? config.srcDirectories : []
  ).filter((d): d is string => typeof d === 'string')
  const scaffold = (config.scaffold ?? {}) as Record<string, unknown>
  const defaultScaffoldDir = srcDirs[0]
    ? join(srcDirs[0], 'scaffold')
    : 'src/scaffold'
  const scaffoldDir = abs(
    stringOrUndefined(scaffold.pikkuDir) ?? defaultScaffoldDir
  )

  // Where `pikku all` writes one output: an explicit path wins, else the
  // scaffold directory. Explicit siblings (schemas) follow the main file.
  const featurePath = (feature: string): string | undefined => {
    const v = scaffold[feature]
    return typeof v === 'object' && v !== null
      ? stringOrUndefined((v as { path?: unknown }).path)
      : undefined
  }
  const expectedPath = (o: (typeof SCAFFOLD_OUTPUTS)[number]): string => {
    const own =
      stringOrUndefined(o.field ? config[o.field] : undefined) ??
      (o.main ? featurePath(o.feature) : undefined)
    if (own) return abs(own)
    const main = SCAFFOLD_OUTPUTS.find(
      (m) => m.feature === o.feature && m.main
    )!
    const mainOwn =
      stringOrUndefined(config[main.field]) ?? featurePath(o.feature)
    if (mainOwn) return join(dirname(abs(mainOwn)), o.file)
    return join(scaffoldDir, o.dir, o.file)
  }

  const files = new Set<string>()
  for (const dir of srcDirs) {
    for (const f of await listTsFiles(abs(dir))) files.add(resolve(f))
  }

  // 1. generated scaffold files outside the scaffold directory
  const strayFiles = new Set<string>()
  const homeFiles = new Set(
    SCAFFOLD_OUTPUTS.map((o) => resolve(expectedPath(o)))
  )
  for (const file of [...files].sort()) {
    const output = SCAFFOLD_OUTPUTS.find(
      (o) => basename(file) === o.file && basename(dirname(file)) === o.dir
    )
    if (!output) continue
    const expected = expectedPath(output)
    if (resolve(expected) === file) continue
    strayFiles.add(file)
    findings.push({
      id: 'scaffold-output-outside-scaffold-dir',
      severity: 'error',
      message: `${rel(file)} is scaffold output for "${output.feature}" but the scaffold lives in ${rel(dirname(dirname(expected)))} — \`pikku all\` writes it to ${rel(expected)}, so this second copy is never regenerated and ships alongside it`,
      path: file,
      fixHint: [
        `Delete ${rel(file)} (a stale scaffold from an earlier layout), then run \`pikku all\` to regenerate ${rel(expected)}.`,
        'Scaffolded files must not live anywhere else in the codebase.',
      ].join('\n'),
    })
  }

  // 2. a hand-written wireAddon for an addon the scaffold already wires
  const isScaffoldFile = (f: string) =>
    f.startsWith(scaffoldDir + '/') || strayFiles.has(f) || homeFiles.has(f)
  const scaffoldWired = new Map<string, { file?: string; feature?: string }>()
  const remember = (
    key: string | undefined,
    file?: string,
    feature?: string
  ) => {
    if (key && !scaffoldWired.get(key)?.file) {
      scaffoldWired.set(key, {
        file,
        feature: feature ?? scaffoldWired.get(key)?.feature,
      })
    }
  }
  for (const feature of Object.keys(SCAFFOLD_ADDONS)) {
    const v = scaffold[feature]
    if (v === undefined || v === false) continue
    const addon = SCAFFOLD_ADDONS[feature]!
    remember(`name:${addon.name}`, undefined, feature)
    remember(`package:${addon.package}`, undefined, feature)
  }
  const sources = new Map<string, string>()
  for (const file of files) {
    const text = await readFile(file, 'utf8').catch(() => '')
    if (/\bwireAddon\b/.test(text)) sources.set(file, text)
  }
  for (const [file, text] of sources) {
    if (
      !isScaffoldFile(file) ||
      strayFiles.has(file) ||
      !file.includes('.gen.')
    ) {
      continue
    }
    for (const call of wiredAddons(text)) {
      remember(call.name && `name:${call.name}`, file)
      remember(call.package && `package:${call.package}`, file)
    }
  }
  for (const [file, text] of sources) {
    if (isScaffoldFile(file)) continue
    for (const call of wiredAddons(text)) {
      const hit =
        (call.name && scaffoldWired.get(`name:${call.name}`)) ||
        (call.package && scaffoldWired.get(`package:${call.package}`))
      if (!hit) continue
      const label = call.package ?? call.name
      const home = hit.file
        ? rel(hit.file)
        : `${rel(scaffoldDir)}/ (scaffold.${hit.feature})`
      findings.push({
        id: 'scaffold-addon-declared-twice',
        severity: 'error',
        message: `${rel(file)} wires addon ${label} by hand, but the scaffold already wires it in ${home} — the same addon declared twice registers its functions under two wirings`,
        path: file,
        fixHint: [
          `Delete the wireAddon call in ${rel(file)}; the scaffold owns it.`,
          "Run `pikku all` if the scaffold file is missing. Granting the addon's scope in defineRoles is fine and stays.",
        ].join('\n'),
      })
    }
  }

  // The scaffold dir is not where tooling looks
  const canonical = srcDirs[0]
    ? resolve(abs(srcDirs[0]), 'scaffold')
    : undefined
  if (canonical && resolve(scaffoldDir) !== canonical) {
    findings.push({
      id: 'scaffold-dir-noncanonical',
      severity: 'error',
      message: `scaffold.pikkuDir resolves to ${rel(scaffoldDir)}, not ${rel(canonical)} — the scaffold is generated output with one canonical home, and tooling that looks for it there misses this copy`,
      path: join(root, 'pikku.config.json'),
      fixHint: [
        `Set scaffold.pikkuDir to "${rel(canonical)}" (or delete the key), run \`pikku all\`, and delete the old generated dir ${rel(scaffoldDir)}.`,
        'To accept the layout deliberately, set "validate": { "rules": { "scaffold-dir-noncanonical": "off" } } in pikku.config.json.',
      ].join('\n'),
    })
  }

  // Per-rule severity from `validate.rules`; 'off' drops the finding.
  return applyRuleSeverity(findings, config.validate?.rules)
}
