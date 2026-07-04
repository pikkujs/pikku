import type { MetaService } from '@pikku/core/services'
import type { ChannelMeta as CoreChannelMeta } from '@pikku/core/channel'
import type { WorkflowsMeta } from '@pikku/core/workflow'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveFunctionsDir } from '../lib/function-tests-paths.js'
import type {
  FunctionsMeta,
  AgentsMeta,
  AgentMeta,
  MiddlewareGroupsMeta,
  PermissionsGroupsMeta,
  MCPMeta,
  RPCMetaRecord,
  ServicesMetaRecord,
  ServiceMeta,
  MiddlewareMeta,
  PermissionMeta,
  FunctionMeta,
  MiddlewareDefinitionMeta,
  MiddlewareInstanceMeta,
  GroupMeta,
  PermissionDefinitionMeta,
  EmailsMeta,
} from '@pikku/core/services'
import type { GatewaysMeta } from '@pikku/core/gateway'

export type {
  FunctionsMeta,
  AgentsMeta,
  AgentMeta,
  MiddlewareGroupsMeta,
  PermissionsGroupsMeta,
  MCPMeta,
  RPCMetaRecord,
  ServicesMetaRecord,
  ServiceMeta,
  MiddlewareMeta,
  PermissionMeta,
  FunctionMeta,
  MiddlewareDefinitionMeta,
  MiddlewareInstanceMeta,
  GroupMeta,
  PermissionDefinitionMeta,
  EmailsMeta,
}

export interface WiringRef {
  type: string
  id: string
  name: string
}

export interface FunctionUsedBy {
  transports: WiringRef[]
  jobs: WiringRef[]
  workflows: Array<{ id: string; name: string }>
}

export interface HttpRouteMeta {
  pikkuFuncId: string
  route: string
  method: string
  params?: string[]
  query?: string[]
  summary?: string
  description?: string
  tags?: string[]
  errors?: string[]
  auth?: boolean
  sse?: boolean
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
  inputSchemaName?: string
  outputSchemaName?: string
}

export interface CliOptionMeta {
  description: string
  short?: string
  default?: unknown
  choices?: unknown[]
  array?: boolean
  required?: boolean
}

export interface CliPositionalMeta {
  name: string
  required: boolean
  variadic?: boolean
}

export interface CliCommandMeta {
  pikkuFuncId: string
  description?: string
  summary?: string
  parameters?: string
  positionals: CliPositionalMeta[]
  options: Record<string, CliOptionMeta>
  renderName?: string
  subcommands?: Record<string, CliCommandMeta>
  isDefault?: boolean
}

export interface CliProgramMeta {
  wireId: string
  program: string
  description?: string
  commands: Record<string, CliCommandMeta>
  options: Record<string, CliOptionMeta>
  defaultRenderName?: string
}

export interface CliRendererMeta {
  name: string
  exportedName?: string
  filePath: string
  services: { optimized: boolean; services: string[] }
}

export interface ChannelMessageMeta {
  pikkuFuncId: string
  summary?: string
  description?: string
  errors?: string[]
  tags?: string[]
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
}

export interface ChannelMeta {
  name: string
  route: string
  params?: string[]
  query?: string[]
  input: string | null
  connect: ChannelMessageMeta | null
  disconnect: ChannelMessageMeta | null
  message: ChannelMessageMeta | null
  messageWirings: Record<string, Record<string, ChannelMessageMeta>>
  summary?: string
  description?: string
  errors?: string[]
  tags?: string[]
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
}

export interface QueueWorkerMeta {
  pikkuFuncId: string
  queueName: string
  summary?: string
  description?: string
  tags?: string[]
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
  config?: Record<string, unknown>
}

export interface SchedulerTaskMeta {
  pikkuFuncId: string
  name: string
  schedule: string
  summary?: string
  description?: string
  tags?: string[]
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
}

export interface RpcMeta {
  pikkuFuncId: string
}

export interface McpItemMeta {
  pikkuFuncId: string
  method: 'resource' | 'tool' | 'prompt'
  name?: string
  wireId?: string
  description?: string
  summary?: string
  tags?: string[]
  errors?: string[]
  uri?: string
  arguments?: Array<{ name: string; description?: string; required?: boolean }>
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
  inputSchemaName?: string
  outputSchemaName?: string
}

export interface GatewayItemMeta {
  pikkuFuncId: string
  name: string
  type: 'webhook' | 'websocket' | 'listener'
  route?: string
  platform?: string
  packageName?: string
  summary?: string
  description?: string
  tags?: string[]
  errors?: string[]
  auth?: boolean
  gateway: true
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
}

export interface TriggerMeta {
  pikkuFuncId: string
  name: string
  summary?: string
  description?: string
  tags?: string[]
  middleware?: MiddlewareMeta[]
  permissions?: PermissionMeta[]
}

export interface TriggerSourceMeta {
  name: string
  pikkuFuncId: string
  packageName?: string
  summary?: string
  description?: string
}

export interface MetaCounts {
  functions: number
  workflows: number
  httpRoutes: number
  channels: number
  mcpTools: number
  gateways: number
  schedulers: number
  queues: number
  cliCommands: number
  rpcMethods: number
  triggers: number
  triggerSources: number
  agents: number
  emails: number
  secrets: number
  variables: number
}

export interface FunctionTestScenario {
  featureName: string
  featureDescription?: string
  featureFile?: string
  scenarioName: string
  status: 'pass' | 'fail'
  duration?: string
  steps: string[]
}

export interface FunctionTestData {
  generatedAt?: string | null
  status: 'covered' | 'partial' | 'uncovered' | 'unknown'
  coveredLines: number
  totalLines: number
  ratio: number
  missedLines?: number[]
  scenarios: FunctionTestScenario[]
}

interface CucumberStepFinishedMessage {
  testStepResult?: {
    status?: string
    duration?: unknown
  }
}

export interface PikkuMetaState {
  functions: FunctionMeta[]
  httpMeta: HttpRouteMeta[]
  cliMeta: CliProgramMeta[]
  cliRenderers: Record<string, CliRendererMeta>
  channelsMeta: Record<string, ChannelMeta>
  queueMeta: Record<string, QueueWorkerMeta>
  schedulerMeta: Record<string, SchedulerTaskMeta>
  rpcMeta: Record<string, RpcMeta>
  mcpMeta: McpItemMeta[]
  gatewayMeta: GatewayItemMeta[]
  workflows: WorkflowsMeta
  scenarioActors: Record<
    string,
    { email: string; name?: string; jobTitle?: string; personality?: string }
  >
  triggerMeta: Record<string, TriggerMeta>
  triggerSourceMeta: Record<string, TriggerSourceMeta>
  middlewareGroupsMeta: MiddlewareGroupsMeta
  permissionsGroupsMeta: PermissionsGroupsMeta
  agentsMeta: AgentsMeta
  emailsMeta: EmailsMeta
  secretsMeta: Record<string, unknown>
  credentialsMeta: Record<string, unknown>
  variablesMeta: Record<string, unknown>
}

export interface AllMeta extends PikkuMetaState {
  functionUsedBy: Record<string, FunctionUsedBy>
  counts: MetaCounts
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function parseJsonOrNull(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return null
  }
}

async function readOptionalMetaFile(
  metaSource: MetaService | string,
  relativePath: string
): Promise<string | null> {
  if (
    metaSource &&
    typeof metaSource === 'object' &&
    'readFile' in metaSource &&
    typeof metaSource.readFile === 'function'
  ) {
    try {
      return await metaSource.readFile(relativePath)
    } catch {
      return null
    }
  }

  if (typeof metaSource === 'string' && metaSource.length > 0) {
    return readOptionalFile(join(metaSource, relativePath))
  }

  return null
}

function extractCucumberMessages(html: string): unknown[] {
  const match = html.match(/window\.CUCUMBER_MESSAGES\s*=\s*(\[[\s\S]*?\]);/)
  if (!match) {
    return []
  }
  const rawMessages = match[1]
  if (!rawMessages) {
    return []
  }
  const parsed = parseJsonOrNull(rawMessages)
  return asArray(parsed)
}

function durationToMs(duration: unknown): number {
  if (!duration || typeof duration !== 'object') {
    return 0
  }

  const record = duration as {
    seconds?: number | string
    nanos?: number | string
  }
  const seconds = Number(record.seconds ?? 0)
  const nanos = Number(record.nanos ?? 0)
  const totalMs = seconds * 1000 + nanos / 1_000_000
  return Number.isFinite(totalMs) ? totalMs : 0
}

function cucumberTimestampToIso(timestamp: unknown): string | null {
  if (!timestamp || typeof timestamp !== 'object') {
    return null
  }

  const record = timestamp as {
    seconds?: number | string
    nanos?: number | string
  }
  const seconds = Number(record.seconds ?? 0)
  const nanos = Number(record.nanos ?? 0)
  const totalMs = seconds * 1000 + nanos / 1_000_000
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return null
  }

  return new Date(totalMs).toISOString()
}

function expandCalledNames(name: string, rpcMeta: RPCMetaRecord): string[] {
  const withoutVersion = name.replace(/@v\d+$/i, '')
  return [
    ...new Set(
      [
        name,
        rpcMeta[name],
        withoutVersion !== name ? withoutVersion : undefined,
        rpcMeta[withoutVersion],
      ].filter((value): value is string => !!value)
    ),
  ]
}

function uniqueFunctionKeys(func: {
  pikkuFuncId?: string
  name?: string
}): string[] {
  return [
    ...new Set(
      [func.pikkuFuncId, func.name].filter((value): value is string => !!value)
    ),
  ]
}

function buildScenarioMaps(
  messages: unknown[],
  rpcMeta: RPCMetaRecord
): {
  scenariosByFunction: Map<string, FunctionTestScenario[]>
  generatedAt: string | null
} {
  const featureNamesByUri = new Map<string, string>()
  const featureDescriptionsByUri = new Map<string, string>()
  const scenarioByAstId = new Map<
    string,
    {
      featureName: string
      featureDescription: string
      scenarioName: string
      steps: string[]
    }
  >()
  const pickleById = new Map<string, Record<string, unknown>>()
  const testCaseById = new Map<string, Record<string, unknown>>()
  const testCaseStartedById = new Map<string, Record<string, unknown>>()
  const stepResultsByStartedId = new Map<string, Record<string, unknown>[]>()
  let generatedAt: string | null = null

  for (const message of messages) {
    const record = message as Record<string, any>
    const gherkinDocument = record.gherkinDocument
    if (gherkinDocument?.uri && gherkinDocument.feature?.name) {
      featureNamesByUri.set(gherkinDocument.uri, gherkinDocument.feature.name)
      featureDescriptionsByUri.set(
        gherkinDocument.uri,
        gherkinDocument.feature.description ?? ''
      )
    }

    for (const child of asArray<Record<string, any>>(
      gherkinDocument?.feature?.children
    )) {
      const scenario = child?.scenario
      if (!scenario?.id) continue
      const steps = asArray<Record<string, any>>(scenario.steps).map((step) =>
        `${(step.keyword ?? '').trim()} ${step.text ?? ''}`.trim()
      )
      scenarioByAstId.set(scenario.id, {
        featureName: gherkinDocument?.feature?.name ?? '',
        featureDescription: gherkinDocument?.feature?.description ?? '',
        scenarioName: scenario.name ?? '',
        steps,
      })
    }

    const pickle = record.pickle
    if (pickle?.id) pickleById.set(pickle.id, pickle)

    const testCase = record.testCase
    if (testCase?.id) testCaseById.set(testCase.id, testCase)

    const started = record.testCaseStarted
    if (started?.id) {
      testCaseStartedById.set(started.id, started)
      const startedAt = cucumberTimestampToIso(started.timestamp)
      if (startedAt && (!generatedAt || startedAt > generatedAt)) {
        generatedAt = startedAt
      }
    }

    const finished = record.testStepFinished
    if (finished?.testCaseStartedId) {
      const entries =
        stepResultsByStartedId.get(finished.testCaseStartedId) ?? []
      entries.push(finished)
      stepResultsByStartedId.set(finished.testCaseStartedId, entries)
    }
  }

  const scenariosByFunction = new Map<string, FunctionTestScenario[]>()

  for (const started of testCaseStartedById.values()) {
    const testCase = testCaseById.get(String(started.testCaseId))
    const pickle = testCase ? pickleById.get(String(testCase.pickleId)) : null
    if (!pickle) continue

    const astId = asArray<string>(pickle.astNodeIds)[0]
    const astScenario = astId ? scenarioByAstId.get(astId) : null
    const steps =
      astScenario?.steps ??
      asArray<Record<string, any>>(pickle.steps)
        .map((step) => step?.text ?? '')
        .filter(Boolean)
    const featureFile = typeof pickle.uri === 'string' ? pickle.uri : undefined
    const featureName =
      astScenario?.featureName ||
      (featureFile ? featureNamesByUri.get(featureFile) : '') ||
      ''
    const featureDescription =
      astScenario?.featureDescription ||
      (featureFile ? featureDescriptionsByUri.get(featureFile) : '') ||
      ''
    const stepResults = (stepResultsByStartedId.get(String(started.id)) ??
      []) as CucumberStepFinishedMessage[]
    const status: 'pass' | 'fail' = stepResults.some(
      (entry) =>
        entry?.testStepResult?.status !== 'PASSED' &&
        entry?.testStepResult?.status !== 'SKIPPED'
    )
      ? 'fail'
      : 'pass'
    const totalDurationMs = stepResults.reduce(
      (sum, entry) => sum + durationToMs(entry?.testStepResult?.duration),
      0
    )
    const duration =
      totalDurationMs > 0 ? `${Math.round(totalDurationMs)}ms` : undefined

    const scenarioData: FunctionTestScenario = {
      featureName,
      featureDescription,
      featureFile,
      scenarioName: String(
        pickle.name ?? astScenario?.scenarioName ?? 'Scenario'
      ),
      status,
      duration,
      steps,
    }

    const mentionedFunctions = new Set<string>()
    for (const step of steps) {
      const match = step.match(/calls\s+"([^"]+)"/i)
      if (!match) continue
      for (const functionName of expandCalledNames(match[1], rpcMeta)) {
        mentionedFunctions.add(functionName)
      }
    }

    for (const functionName of mentionedFunctions) {
      const scenarios = scenariosByFunction.get(functionName) ?? []
      scenarios.push(scenarioData)
      scenariosByFunction.set(functionName, scenarios)
    }
  }

  return { scenariosByFunction, generatedAt }
}

async function loadFunctionTests(
  metaSource: MetaService | string,
  functionsMeta: FunctionsMeta,
  rpcMeta: RPCMetaRecord
): Promise<Record<string, FunctionTestData>> {
  let testsOutputDir: string | null = null
  try {
    const configContent = await readOptionalMetaFile(
      metaSource,
      '../pikku.config.json'
    )
    if (configContent) {
      const pikkuConfig = parseJsonOrNull(configContent) as {
        tests?: { outputDir?: string }
      } | null
      testsOutputDir = pikkuConfig?.tests?.outputDir ?? null
    }
  } catch {
    // ignore — no config or unreadable
  }

  // Canonical harness layout, anchored on the SAME functions dir the run
  // handlers and `pikku tests coverage` write to (see function-tests-paths.ts):
  // `<functionsDir>/tests/.coverage/function-coverage.json` and
  // `<functionsDir>/tests/tests/reports/cucumber-report.html`.
  const basePath =
    metaSource &&
    typeof metaSource === 'object' &&
    'basePath' in metaSource &&
    typeof metaSource.basePath === 'string'
      ? metaSource.basePath
      : typeof metaSource === 'string'
        ? metaSource
        : null
  const functionsDir = basePath ? resolveFunctionsDir(basePath) : null

  // Relative fallbacks for non-standard layouts / `tests.outputDir` overrides.
  const coverageCandidates = testsOutputDir
    ? [
        `../${testsOutputDir}/.coverage/function-coverage.json`,
        `../${testsOutputDir}/coverage/function-coverage.json`,
      ]
    : [
        '../tests/.coverage/function-coverage.json',
        '../function-tests/coverage/function-coverage.json',
        'function-tests/coverage/function-coverage.json',
      ]
  const cucumberCandidates = testsOutputDir
    ? [
        `../${testsOutputDir}/tests/reports/cucumber-report.html`,
        `../${testsOutputDir}/reports/cucumber-report.html`,
      ]
    : [
        '../tests/tests/reports/cucumber-report.html',
        '../function-tests/tests/reports/cucumber-report.html',
        'function-tests/tests/reports/cucumber-report.html',
      ]

  const coverageContent =
    (functionsDir
      ? await readOptionalFile(
          join(functionsDir, 'tests', '.coverage', 'function-coverage.json')
        )
      : null) ??
    (
      await Promise.all(
        coverageCandidates.map((path) => readOptionalMetaFile(metaSource, path))
      )
    ).find((content) => typeof content === 'string' && content.length > 0) ??
    null

  const cucumberHtml =
    (functionsDir
      ? await readOptionalFile(
          join(
            functionsDir,
            'tests',
            'tests',
            'reports',
            'cucumber-report.html'
          )
        )
      : null) ??
    (
      await Promise.all(
        cucumberCandidates.map((path) => readOptionalMetaFile(metaSource, path))
      )
    ).find((content) => typeof content === 'string' && content.length > 0) ??
    null

  const coverageJson = coverageContent
    ? (parseJsonOrNull(coverageContent) as {
        generatedAt?: string
        functions?: any[]
      } | null)
    : null
  const coverageFunctions = new Map(
    asArray<Record<string, any>>(coverageJson?.functions).map((func) => [
      func.name,
      func,
    ])
  )
  const { scenariosByFunction, generatedAt: scenarioGeneratedAt } = cucumberHtml
    ? buildScenarioMaps(extractCucumberMessages(cucumberHtml), rpcMeta)
    : {
        scenariosByFunction: new Map<string, FunctionTestScenario[]>(),
        generatedAt: null,
      }
  const generatedAt = scenarioGeneratedAt ?? coverageJson?.generatedAt ?? null

  const testsByFunction: Record<string, FunctionTestData> = {}
  for (const func of Object.values(functionsMeta)) {
    const functionKeys = uniqueFunctionKeys(func)
    const primaryFunctionKey = functionKeys[0]
    if (!primaryFunctionKey) continue

    const coverage = functionKeys
      .map((key) => coverageFunctions.get(key))
      .find((value) => !!value)
    const scenarios = functionKeys.flatMap(
      (key) => scenariosByFunction.get(key) ?? []
    )
    if (!coverage && scenarios.length === 0) continue

    const testData: FunctionTestData = {
      generatedAt,
      status: (coverage?.status ?? 'unknown') as FunctionTestData['status'],
      coveredLines: Number(coverage?.coveredLines ?? 0),
      totalLines: Number(coverage?.totalLines ?? 0),
      ratio: Number(coverage?.ratio ?? 0),
      missedLines: asArray<number>(coverage?.missedLines).filter((line) =>
        Number.isFinite(line)
      ),
      scenarios,
    }

    for (const functionKey of functionKeys) {
      testsByFunction[functionKey] = testData
    }
  }

  return testsByFunction
}

export class WiringService {
  constructor(private metaService: MetaService) {}

  async readAllMeta(): Promise<AllMeta> {
    const [
      functions,
      httpMetaRaw,
      cliMetaRaw,
      channelsMeta,
      queueMeta,
      schedulerMeta,
      rpcMetaRaw,
      mcpMetaRaw,
      gatewayMetaRaw,
      workflows,
      scenarioActors,
      triggerMeta,
      triggerSourceMeta,
      middlewareGroupsMeta,
      permissionsGroupsMeta,
      agentsMeta,
      emailsMeta,
      secretsMeta,
      credentialsMeta,
      variablesMeta,
    ] = await Promise.all([
      this.metaService.getFunctionsMeta(),
      this.metaService.getHttpMeta(),
      this.metaService.getCliMeta(),
      this.metaService.getChannelsMeta(),
      this.metaService.getQueueMeta(),
      this.metaService.getSchedulerMeta(),
      this.metaService.getRpcMeta(),
      this.metaService.getMcpMeta(),
      this.metaService.getGatewayMeta(),
      this.metaService.getWorkflowMeta(),
      this.metaService.getScenarioActorsMeta(),
      this.metaService.getTriggerMeta(),
      this.metaService.getTriggerSourceMeta(),
      this.metaService.getMiddlewareGroupsMeta(),
      this.metaService.getPermissionsGroupsMeta(),
      this.metaService.getAgentsMeta(),
      this.metaService.getEmailMeta(),
      this.metaService.getSecretsMeta(),
      this.metaService.getCredentialsMeta(),
      this.metaService.getVariablesMeta(),
    ])

    const httpMeta = Object.entries(httpMetaRaw || {}).flatMap(
      ([method, routes]) =>
        Object.entries(routes as Record<string, unknown>).map(
          ([route, meta]) => ({
            ...(meta as Record<string, unknown>),
            route,
            method,
          })
        )
    ) as HttpRouteMeta[]
    httpMeta.sort((a, b) => a.route.localeCompare(b.route))

    const cliMeta = Object.entries(cliMetaRaw.programs || {}).map(
      ([programName, programMeta]) => ({
        ...(programMeta as Record<string, unknown>),
        wireId: programName,
      })
    ) as CliProgramMeta[]

    const cliRenderers: Record<string, CliRendererMeta> =
      ((cliMetaRaw as unknown as Record<string, unknown>).renderers as Record<
        string,
        CliRendererMeta
      >) || {}

    const mcpMeta: McpItemMeta[] = []
    if (mcpMetaRaw.resources) {
      for (const item of Object.values(mcpMetaRaw.resources)) {
        mcpMeta.push({ ...item, method: 'resource' } as McpItemMeta)
      }
    }
    if (mcpMetaRaw.tools) {
      for (const item of Object.values(mcpMetaRaw.tools)) {
        mcpMeta.push({ ...item, method: 'tool' } as McpItemMeta)
      }
    }
    if (mcpMetaRaw.prompts) {
      for (const item of Object.values(mcpMetaRaw.prompts)) {
        mcpMeta.push({ ...item, method: 'prompt' } as McpItemMeta)
      }
    }

    const gatewayMeta = Object.values(
      (gatewayMetaRaw || {}) as GatewaysMeta
    ) as GatewayItemMeta[]
    gatewayMeta.sort((a, b) => a.name.localeCompare(b.name))

    const rpcMeta: Record<string, RpcMeta> = {}
    for (const [name, value] of Object.entries(rpcMetaRaw)) {
      rpcMeta[name] = {
        pikkuFuncId: value,
      }
    }

    const testsByFunction = await loadFunctionTests(
      this.metaService,
      functions,
      rpcMetaRaw
    )
    for (const func of Object.values(functions)) {
      const funcId = func.pikkuFuncId || func.name
      if (funcId && testsByFunction[funcId]) {
        ;(func as FunctionMeta & { tests?: FunctionTestData }).tests =
          testsByFunction[funcId]
      }
    }

    const functionUsedBy: Record<string, FunctionUsedBy> = {}
    const getOrCreate = (funcName: string): FunctionUsedBy => {
      if (!functionUsedBy[funcName]) {
        functionUsedBy[funcName] = { transports: [], jobs: [], workflows: [] }
      }
      return functionUsedBy[funcName]
    }

    for (const route of httpMeta) {
      if (route.pikkuFuncId) {
        getOrCreate(route.pikkuFuncId).transports.push({
          type: 'http',
          id: `${route.method}::${route.route}`,
          name: `${route.method?.toUpperCase()} ${route.route}`,
        })
      }
    }

    for (const [channelName, channelData] of Object.entries(channelsMeta) as [
      string,
      ChannelMeta,
    ][]) {
      for (const event of ['connect', 'disconnect', 'message'] as const) {
        const eventData = channelData[event] as ChannelMessageMeta | null
        if (eventData?.pikkuFuncId) {
          getOrCreate(eventData.pikkuFuncId).transports.push({
            type: 'channel',
            id: `${channelName}::${event}`,
            name: `${channelName} ${event}`,
          })
        }
      }
      if (channelData.messageWirings) {
        for (const actions of Object.values(channelData.messageWirings)) {
          for (const [actionName, actionData] of Object.entries(actions)) {
            if (actionData?.pikkuFuncId) {
              getOrCreate(actionData.pikkuFuncId).transports.push({
                type: 'channel',
                id: `${channelName}::${actionName}`,
                name: `${channelName} ${actionName}`,
              })
            }
          }
        }
      }
    }

    for (const item of mcpMeta) {
      if (item.pikkuFuncId) {
        getOrCreate(item.pikkuFuncId).transports.push({
          type: 'mcp',
          id: item.wireId || item.name || '',
          name: `${item.method}: ${item.name || item.wireId}`,
        })
      }
    }

    for (const item of gatewayMeta) {
      if (item.pikkuFuncId) {
        getOrCreate(item.pikkuFuncId).transports.push({
          type: 'gateway',
          id: item.name,
          name: `${item.type}: ${item.name}`,
        })
      }
    }

    for (const program of cliMeta) {
      const walkCommands = (
        commands: Record<string, CliCommandMeta> | undefined,
        path: string
      ) => {
        if (!commands) return
        for (const [cmdName, cmdData] of Object.entries(commands)) {
          const fullPath = path ? `${path} ${cmdName}` : cmdName
          if (cmdData.pikkuFuncId) {
            getOrCreate(cmdData.pikkuFuncId).transports.push({
              type: 'cli',
              id: `${program.wireId}::${fullPath}`,
              name: `${program.wireId} ${fullPath}`,
            })
          }
          if (cmdData.subcommands) walkCommands(cmdData.subcommands, fullPath)
        }
      }
      walkCommands(program.commands, '')
    }

    for (const [name, data] of Object.entries(rpcMeta)) {
      if (data.pikkuFuncId) {
        getOrCreate(data.pikkuFuncId).transports.push({
          type: 'rpc',
          id: name,
          name,
        })
      }
    }

    for (const [name, data] of Object.entries(schedulerMeta)) {
      if (data.pikkuFuncId) {
        getOrCreate(data.pikkuFuncId).jobs.push({
          type: 'scheduler',
          id: name,
          name,
        })
      }
    }

    for (const [name, data] of Object.entries(queueMeta)) {
      if (data.pikkuFuncId) {
        getOrCreate(data.pikkuFuncId).jobs.push({
          type: 'queue',
          id: name,
          name,
        })
      }
    }

    for (const [name, data] of Object.entries(triggerMeta)) {
      if (data.pikkuFuncId) {
        getOrCreate(data.pikkuFuncId).jobs.push({
          type: 'trigger',
          id: name,
          name,
        })
      }
    }

    for (const [agentName, agentData] of Object.entries(agentsMeta) as [
      string,
      AgentMeta,
    ][]) {
      if (agentData.tools) {
        for (const tool of agentData.tools) {
          getOrCreate(tool).transports.push({
            type: 'agent',
            id: agentName,
            name: agentName,
          })
        }
      }
    }

    for (const [_workflowName, workflowData] of Object.entries(workflows) as [
      string,
      Record<string, unknown>,
    ][]) {
      const usedBy = functionUsedBy[workflowData.pikkuFuncId as string]
      if (usedBy) {
        workflowData.wiredTo = {
          transports: usedBy.transports,
          jobs: usedBy.jobs,
        }
      }
    }

    let cliCommandCount = 0
    const countCli = (commands: Record<string, CliCommandMeta> | undefined) => {
      if (!commands) return
      for (const cmd of Object.values(commands)) {
        if (cmd.pikkuFuncId) cliCommandCount++
        if (cmd.subcommands) countCli(cmd.subcommands)
      }
    }
    for (const program of cliMeta) {
      countCli(program.commands)
    }

    const counts: MetaCounts = {
      functions: Object.values(functions).length,
      workflows: Object.keys(workflows).length,
      httpRoutes: httpMeta.length,
      channels: Object.keys(channelsMeta).length,
      mcpTools: mcpMeta.filter((i) => i.method === 'tool').length,
      gateways: gatewayMeta.length,
      schedulers: Object.keys(schedulerMeta).length,
      queues: Object.keys(queueMeta).length,
      cliCommands: cliCommandCount,
      rpcMethods: Object.keys(rpcMeta).length,
      triggers: Object.keys(triggerMeta).length,
      triggerSources: Object.keys(triggerSourceMeta).length,
      agents: Object.keys(agentsMeta).length,
      emails: Object.keys(emailsMeta.templates ?? {}).length,
      secrets: Object.keys(secretsMeta).length,
      variables: Object.keys(variablesMeta).length,
    }

    return {
      functions: Object.values(functions),
      httpMeta,
      cliMeta,
      cliRenderers,
      channelsMeta: channelsMeta as unknown as AllMeta['channelsMeta'],
      queueMeta: queueMeta as unknown as AllMeta['queueMeta'],
      schedulerMeta: schedulerMeta as unknown as AllMeta['schedulerMeta'],
      rpcMeta,
      mcpMeta,
      gatewayMeta,
      workflows,
      scenarioActors,
      triggerMeta: triggerMeta as unknown as AllMeta['triggerMeta'],
      triggerSourceMeta:
        triggerSourceMeta as unknown as AllMeta['triggerSourceMeta'],
      middlewareGroupsMeta,
      permissionsGroupsMeta,
      agentsMeta,
      emailsMeta,
      secretsMeta,
      credentialsMeta,
      variablesMeta,
      functionUsedBy,
      counts,
    }
  }

  generateChannelSnippets(
    channelName: string,
    channel: CoreChannelMeta
  ): ChannelSnippets {
    const route = channel.route
    const categories = Object.entries(channel.messageWirings || {})

    const routeVars = categories
      .map(([cat]) => `const ${cat} = pikkuWS.getRoute('${cat}');`)
      .join('\n')

    const overview = [
      `const ws = new PikkuWebsocket('ws://localhost:3000${route}');`,
      routeVars,
    ]
      .filter(Boolean)
      .join('\n')

    const handlers: Record<string, string> = {}
    if (channel.connect) {
      handlers.connect = `// Connection is established when the WebSocket opens`
    }
    if (channel.disconnect) {
      handlers.disconnect = `ws.close();`
    }
    if (channel.message) {
      handlers.message = `ws.send({ /* message data */ });`
    }

    const actions: Record<string, Record<string, string>> = {}
    for (const [cat, catActions] of categories) {
      actions[cat] = {}
      for (const action of Object.keys(catActions)) {
        actions[cat][action] = [
          `const ${cat} = pikkuWS.getRoute('${cat}');`,
          ``,
          `// Send`,
          `${cat}.send('${action}', { /* data */ });`,
          ``,
          `// Subscribe to responses`,
          `${cat}.subscribe('${action}', (data) => {`,
          `  // handle response`,
          `});`,
        ].join('\n')
      }
    }

    return { overview, handlers, actions }
  }
}

export interface ChannelSnippets {
  overview: string
  handlers: Record<string, string>
  actions: Record<string, Record<string, string>>
}
