import { PikkuCLIConfigError } from './pikku-cli-config-error.js'

/**
 * The strict half of the loader: every key in `pikku.config.json` is a key of
 * `PikkuCLIInput` (types/config.d.ts) or it is refused. A key that moved is
 * refused naming its new home; a key nobody reads is refused saying so. Keeping
 * this table in step with the type is what makes the config mean what it says.
 */

type Shape =
  | 'any'
  | { keys: Record<string, Shape>; each?: never }
  | { each: Shape; keys?: never }

const obj = (keys: Record<string, Shape>): Shape => ({ keys })
const rec = (each: Shape): Shape => ({ each })

const SCAFFOLD = obj({
  addonDir: 'any',
  functionDir: 'any',
  wiringDir: 'any',
  middlewareDir: 'any',
  permissionDir: 'any',
  pikkuDir: 'any',
  graph: 'any',
  rpc: 'any',
  analytics: 'any',
  cors: 'any',
  featureFlags: 'any',
  admin: 'any',
  console: 'any',
  scenarios: 'any',
  virtualUser: 'any',
  agent: 'any',
  workflow: 'any',
  events: 'any',
  meshRpc: 'any',
  remoteJobs: 'any',
  webhook: 'any',
})

const FILTER = obj({
  names: 'any',
  tags: 'any',
  wires: 'any',
  directories: 'any',
  httpRoutes: 'any',
  httpMethods: 'any',
  excludeNames: 'any',
  excludeTags: 'any',
  excludeWires: 'any',
  excludeDirectories: 'any',
  excludeHttpRoutes: 'any',
  excludeHttpMethods: 'any',
  target: 'any',
  excludeTarget: 'any',
  workflowMeta: 'any',
})

const SHAPE: Shape = obj({
  $schema: 'any',
  rootDir: 'any',
  runtimeDir: 'any',
  srcDirectories: 'any',
  ignoreFiles: 'any',
  packageMappings: 'any',
  addon: obj({
    categories: 'any',
    icon: 'any',
    displayName: 'any',
    description: 'any',
    serverlessIncompatible: 'any',
    openapi: obj({ version: 'any', hash: 'any' }),
  }),
  allowShadowedServices: 'any',
  metaLocale: 'any',
  tsconfig: 'any',
  clientFiles: obj({
    typesFile: 'any',
    envFile: 'any',
    rpcFile: 'any',
    authClientFile: 'any',
    realtimeEventHubTopicsImport: 'any',
    nextBackendFile: 'any',
    nextHTTPFile: 'any',
    nextBackendTransport: 'any',
    nextBackendFetcherImport: 'any',
    tanstackStartFile: 'any',
  }),
  clientAuth: obj({
    loginPath: 'any',
    homePath: 'any',
    resetPasswordPath: 'any',
  }),
  emailTemplatesDir: 'any',
  i18n: obj({ ignore: 'any' }),
  registry: 'any',
  cloud: obj({ projectId: 'any' }),
  frontends: rec(
    obj({
      cwd: 'any',
      dist: 'any',
      primary: 'any',
      deploy: 'any',
      kind: 'any',
      dev: obj({ command: 'any', port: 'any', healthPath: 'any' }),
      serves: 'any',
      virtualUsers: 'any',
      routeParams: 'any',
      planSlug: 'any',
      serve: obj({ urlPrefix: 'any', spaFallback: 'any' }),
      native: obj({
        identifier: 'any',
        productName: 'any',
        platforms: 'any',
        plugins: 'any',
        url: 'any',
        bundleServer: 'any',
      }),
    })
  ),
  blocks: 'any',
  authFile: 'any',
  authTypesFile: 'any',
  authMetaJsonFile: 'any',
  openAPI: obj({ outputFile: 'any', additionalInfo: 'any' }),
  schema: obj({ additionalProperties: 'any', supportsImportAttributes: 'any' }),
  db: obj({
    engine: 'any',
    pgVersion: 'any',
    mysqlUrl: 'any',
    schema: 'any',
    defaultSchema: 'any',
    pgliteExtensions: 'any',
    sqliteExtensions: 'any',
  }),
  cli: obj({ entrypoints: 'any' }),
  workflows: obj({ orchestratorQueue: 'any', workerQueue: 'any' }),
  // Entries are checked by `normalizeEnvironments`, which knows the shapes.
  environments: 'any',
  scenarios: obj({
    emailDomain: 'any',
    browserDriver: 'any',
    model: 'any',
    reset: obj({ enabled: 'any', keep: 'any' }),
  }),
  validate: obj({
    rules: 'any',
    oxlint: obj({ timeoutSeconds: 'any' }),
  }),
  scaffold: SCAFFOLD,
  models: 'any',
  tests: obj({ outputDir: 'any' }),
  forceRequiredServices: 'any',
  schemasFromTypes: 'any',
  lint: obj({
    servicesNotDestructured: 'any',
    wiresNotDestructured: 'any',
    functionDynamicImport: 'any',
    enforceContentService: 'any',
    enforceVariablesService: 'any',
    customServerBootstrap: 'any',
    coreImport: 'any',
  }),
  allow: obj({ permissionsInBody: 'any', complexWorkflows: 'any' }),
  addonMetaJsonFile: 'any',
  globalHTTPPrefix: 'any',
  binary: obj({ entrypoint: 'any', output: 'any', targets: 'any' }),
  // deploy is checked key by key in pikku-cli-config.ts (assertDeployShape).
  deploy: 'any',
  release: obj({
    trunk: 'any',
    production: 'any',
    branch: 'any',
    remote: 'any',
  }),
  backends: rec(
    obj({
      filter: FILTER,
      deploy: 'any',
      dev: obj({ port: 'any' }),
      content: obj({
        contentPath: 'any',
        uploadUrlPrefix: 'any',
        assetUrlPrefix: 'any',
        sizeLimit: 'any',
      }),
      publish: 'any',
    })
  ),
})

const SDK_HOME = '.pikku/sdk/<backend>/exposed/'
const FLAG = (name: string) =>
  `is the \`--${name}\` flag of the CLI, not a config key; delete it`
const UNREAD = 'is not read by anything; delete it'

/**
 * Keys that used to be accepted at the top level, and what to say about each.
 * A function receives the config so one key can answer differently by value.
 */
const MOVED_TOP_LEVEL: Record<
  string,
  string | ((value: unknown, file: string) => string)
> = {
  outDir:
    'is no longer a config key: generated files always go to `.pikku/` beside pikku.config.json. Delete it (`--outDir` stays as an internal flag for per-unit codegen)',
  dev: (value) => {
    const entry = (value ?? {}) as Record<string, unknown>
    if ('contributors' in entry) {
      return 'dev.contributors is no longer read. Register the contributors with defineContributors in an addon and opt in with wireAddon({ contributors: [...] }); see docs/contributors.md'
    }
    return 'has moved to backends.<name>.dev, which takes `port` only (`dev.db` and `dev.contributors` are gone). Delete it and set backends.<name>.dev.port'
  },
  content:
    'has moved to backends.<name>.content: each backend runs as its own process with its own files, so the content settings are per backend. Move the block there',
  addons:
    'is not a config key yet: wire an addon in code with wireAddon. Delete it',
  supportsImportAttributes: 'is now schema.supportsImportAttributes',
  entrypoint: UNREAD,
  showcase: UNREAD,
  fabric: UNREAD,
  node: UNREAD,
  rpc: UNREAD,
  frontend: `${UNREAD}; frontends is the one list of apps`,
  verboseMeta: UNREAD,
  fetchFile: `is generated at ${SDK_HOME}pikku-fetch.gen.ts; delete it`,
  websocketFile: `is generated at ${SDK_HOME}pikku-websocket.gen.ts; delete it`,
  nextHTTPFile: 'is now clientFiles.nextHTTPFile',
  nextBackendFile: 'is now clientFiles.nextBackendFile',
  remoteRpcWorkersFile:
    'is generated under `.pikku/` and not configurable; delete it',
  security: FLAG('security'),
  tsc: FLAG('tsc'),
  tscSummary: FLAG('tscSummary'),
  diff: FLAG('diff'),
  inspector: FLAG('inspector'),
  stateOutput: FLAG('stateOutput'),
  stateInput: FLAG('stateInput'),
  tags: 'is a backend filter: backends.<name>.filter.tags',
  wires: 'is a backend filter: backends.<name>.filter.wires',
  excludeWires: 'is a backend filter: backends.<name>.filter.excludeWires',
  config: FLAG('config'),
  configFile: FLAG('configFile'),
  userSessionType: 'is derived by the CLI; delete it',
  singletonServicesFactoryType: 'is derived by the CLI; delete it',
  wireServicesFactoryType: 'is derived by the CLI; delete it',
  resolvedScaffoldDir: 'is derived by the CLI; delete it',
  addonName: 'is derived from package.json; delete it',
  configDir: 'is derived by the CLI; delete it',
  clientAuthFile: UNREAD,
}

const NESTED_MOVED: Record<string, string> = {
  'scenarios.environments':
    'is the top-level `environments` block. Move it there (backends and frontends by name)',
  'clientFiles.startServerFnsFile': 'is now clientFiles.tanstackStartFile',
  'backends.*.filter.serverlessIncompatible':
    'is deploy.serverlessIncompatible, which the backend filter reads from the project',
  'backends.*.filter.defaultTarget':
    'is backends.<name>.deploy.target (or deploy.target for the project)',
  'backends.*.openapi': 'is the top-level openAPI block',
  'backends.*.workflows': 'is the top-level workflows block',
  'backends.*.globalHTTPPrefix': 'is the top-level globalHTTPPrefix',
}

const GENERATED_SUFFIX = /(File|Dir|Directory)$/

const wildcardPath = (path: string[]) =>
  path
    .map((part, i) => (i === 1 && path[0] === 'backends' ? '*' : part))
    .join('.')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const check = (
  value: unknown,
  shape: Shape,
  path: string[],
  file: string
): void => {
  if (shape === 'any' || !isRecord(value)) return

  if (shape.each) {
    for (const [name, entry] of Object.entries(value)) {
      check(entry, shape.each, [...path, name], file)
    }
    return
  }

  const keys = shape.keys!
  for (const [key, child] of Object.entries(value)) {
    const at = [...path, key]
    const dotted = at.join('.')
    if (key in keys) {
      check(child, keys[key]!, at, file)
      continue
    }

    const nested = NESTED_MOVED[wildcardPath(at)]
    if (nested) {
      throw new PikkuCLIConfigError(`${dotted} in ${file} ${nested}.`)
    }
    if (path.length === 0) {
      const moved = MOVED_TOP_LEVEL[key]
      if (moved) {
        const message = typeof moved === 'function' ? moved(child, file) : moved
        throw new PikkuCLIConfigError(
          message.startsWith('dev.contributors')
            ? `${message}`
            : `${dotted} in ${file} ${message}.`
        )
      }
      if (GENERATED_SUFFIX.test(key)) {
        throw new PikkuCLIConfigError(
          `${dotted} in ${file} is a generated path and not configurable: \`pikku all\` writes it under \`.pikku/\`. Delete it.`
        )
      }
    }
    const allowed = Object.keys(keys)
    throw new PikkuCLIConfigError(
      `${dotted} in ${file} is not a pikku.config.json key. ${
        path.length === 0 ? 'Top-level keys' : `Keys under ${path.join('.')}`
      }: ${allowed.join(', ')}.`
    )
  }
}

/** Throws a `PikkuCLIConfigError` naming the first key the config may not carry. */
export const assertKnownConfigKeys = (
  config: Record<string, unknown>,
  file: string
): void => check(config, SHAPE, [], file)
