import { existsSync } from 'fs'
import { pikkuWorkflowComplexFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

type ScaffoldGenerator =
  | 'pikkuPublicRPC'
  | 'pikkuConsoleFunctions'
  | 'pikkuPublicAgent'

const scaffoldFiles = (
  config: any
): { file: string; generator: ScaffoldGenerator }[] => {
  const files: { file: string; generator: ScaffoldGenerator }[] = []
  if (config.scaffold?.rpc && config.publicRpcFile)
    files.push({ file: config.publicRpcFile, generator: 'pikkuPublicRPC' })
  if (config.scaffold?.console && config.consoleFunctionsFile)
    files.push({
      file: config.consoleFunctionsFile,
      generator: 'pikkuConsoleFunctions',
    })
  if (config.scaffold?.agent && config.publicAgentFile)
    files.push({
      file: config.publicAgentFile,
      generator: 'pikkuPublicAgent',
    })
  return files
}

export const allWorkflow = pikkuWorkflowComplexFunc<void, void>({
  title: 'Pikku All',
  func: async ({ logger, config, getInspectorState }, _data, { workflow }) => {
    const allImports: string[] = []
    let typesDeclarationFileExists = true

    if (!existsSync(config.outDir)) {
      logger.debug(`• .pikku directory not found, running bootstrap first...`)
      await workflow.do('Bootstrap inspect', async () =>
        getInspectorState(false, false, true)
      )
      await workflow.do('Bootstrap function types', 'pikkuFunctionTypes', null)
      await Promise.all([
        workflow.do(
          'Bootstrap function types split',
          'pikkuFunctionTypesSplit',
          null
        ),
        workflow.do('Bootstrap HTTP types', 'pikkuHTTPTypes', null),
        workflow.do('Bootstrap channel types', 'pikkuChannelTypes', null),
        workflow.do('Bootstrap scheduler types', 'pikkuSchedulerTypes', null),
        workflow.do('Bootstrap queue types', 'pikkuQueueTypes', null),
        workflow.do('Bootstrap workflow', 'pikkuWorkflow', null),
        workflow.do('Bootstrap MCP types', 'pikkuMCPTypes', null),
        workflow.do('Bootstrap AI agent types', 'pikkuAIAgentTypes', null),
        workflow.do('Bootstrap CLI types', 'pikkuCLITypes', null),
      ])
      await workflow.do('Bootstrap re-inspect', async () =>
        getInspectorState(true)
      )
    }

    if (!existsSync(config.typesDeclarationFile)) {
      typesDeclarationFileExists = false
    }

    const missingScaffolds = scaffoldFiles(config).filter(
      (s) => !existsSync(s.file)
    )
    if (missingScaffolds.length > 0) {
      for (const { generator } of missingScaffolds) {
        await workflow.do(`Scaffold ${generator}`, generator, null)
      }
    }

    await workflow.do('Generate function types', 'pikkuFunctionTypes', null)

    if (!typesDeclarationFileExists || missingScaffolds.length > 0) {
      logger.debug(
        `• Type file or scaffolds first created, inspecting again...`
      )
      await workflow.do('Re-inspect after types', async () =>
        getInspectorState(true)
      )
    }

    // Type generators are independent of each other
    const typeGenerators: Promise<any>[] = [
      workflow.do('Function types split', 'pikkuFunctionTypesSplit', null),
      workflow.do('Trigger types', 'pikkuTriggerTypes', null),
      workflow.do('AI agent types', 'pikkuAIAgentTypes', null),
    ]
    if (!config.addon) {
      typeGenerators.push(
        workflow.do('HTTP types', 'pikkuHTTPTypes', null),
        workflow.do('Channel types', 'pikkuChannelTypes', null),
        workflow.do('Scheduler types', 'pikkuSchedulerTypes', null),
        workflow.do('Queue types', 'pikkuQueueTypes', null),
        workflow.do('MCP types', 'pikkuMCPTypes', null),
        workflow.do('CLI types', 'pikkuCLITypes', null)
      )
    }
    await Promise.all(typeGenerators)

    const [middleware, permissions] = await Promise.all([
      workflow.do('Middleware', 'pikkuMiddleware', null),
      workflow.do('Permissions', 'pikkuPermissions', null),
    ])
    if (middleware) {
      allImports.push(config.middlewareFile)
    }
    if (permissions) {
      allImports.push(config.permissionsFile)
    }

    await workflow.do('Services', 'pikkuServices', null)

    const hasPackageFactories = await workflow.do(
      'Package',
      'pikkuPackage',
      null
    )
    if (hasPackageFactories) {
      allImports.push(config.packageFile)
    }

    const [hasInternalRPCs, agents] = await Promise.all([
      workflow.do('RPC', 'pikkuRPC', null),
      workflow.do('AI agent', 'pikkuAIAgent', null),
    ])

    if (agents) {
      allImports.push(config.agentWiringMetaFile, config.agentWiringsFile)
      if (config.scaffold?.agent) {
        await workflow.do('Public agent scaffold', 'pikkuPublicAgent', null)
      }
    }

    // Scaffold and definition generators are all independent
    await Promise.all([
      workflow.do('Public RPC', 'pikkuPublicRPC', null),
      workflow.do('Console functions', 'pikkuConsoleFunctions', null),
      workflow.do('Node types', 'pikkuNodeTypes', null),
      workflow.do(
        'Secret definition types',
        'pikkuSecretDefinitionTypes',
        null
      ),
      workflow.do('Secrets', 'pikkuSecrets', null),
      workflow.do('Credentials', 'pikkuCredentials', null),
      workflow.do(
        'Variable definition types',
        'pikkuVariableDefinitionTypes',
        null
      ),
      workflow.do('Variables', 'pikkuVariables', null),
      workflow.do('Addon types', 'pikkuAddonTypes', null),
    ])

    if (hasInternalRPCs) {
      allImports.push(config.rpcInternalWiringMetaFile)
    }

    if (agents || !config.addon) {
      await workflow.do('Re-inspect after agents', async () =>
        getInspectorState(true)
      )
    }

    const schemas = await workflow.do('Schemas', 'pikkuSchemas', null)
    if (schemas) {
      allImports.push(`${config.schemaDirectory}/register.gen.ts`)
    }

    const [, , workflows] = await Promise.all([
      workflow.do('RPC internal map', 'pikkuRPCInternalMap', null),
      workflow.do('RPC exposed map', 'pikkuRPCExposedMap', null),
      workflow.do('Workflow', 'pikkuWorkflow', null),
    ])

    let remoteRPC = false
    let workflowRoutes = false
    if (!config.addon) {
      remoteRPC = await workflow.do('Remote RPC', 'pikkuRemoteRPC', null)
      if (workflows) {
        workflowRoutes = await workflow.do(
          'Workflow routes',
          'pikkuWorkflowRoutes',
          null
        )
      }
    }

    if (workflows || remoteRPC || workflowRoutes) {
      await workflow.do('Re-inspect after workflows', async () =>
        getInspectorState(true)
      )
      await workflow.do('Re-generate schemas', 'pikkuSchemas', null)
    }

    if (!config.addon) {
      const [http, scheduler, triggers] = await Promise.all([
        workflow.do('HTTP', 'pikkuHTTP', null),
        workflow.do('Scheduler', 'pikkuScheduler', null),
        workflow.do('Trigger', 'pikkuTrigger', null),
      ])

      if (http) {
        await Promise.all([
          workflow.do('HTTP map', 'pikkuHTTPMap', null),
          workflow.do('Fetch', 'pikkuFetch', null),
          workflow.do('RPC client', 'pikkuRPCClient', null),
          workflow.do('React query', 'pikkuReactQuery', null),
        ])
        allImports.push(config.httpWiringMetaFile, config.httpWiringsFile)
      }

      if (scheduler) {
        allImports.push(
          config.schedulersWiringMetaFile,
          config.schedulersWiringFile
        )
      }

      if (triggers) {
        allImports.push(
          config.triggersWiringMetaFile,
          config.triggerSourcesMetaFile,
          config.triggersWiringFile
        )
      }
    }

    const hasFunctionRegistrations = await workflow.do(
      'Functions',
      'pikkuFunctions',
      null
    )
    allImports.push(config.functionsMetaFile)
    if (hasFunctionRegistrations) {
      allImports.push(config.functionsFile)
    }

    if (workflows) {
      allImports.push(config.workflowsWiringFile)
    }

    if (!config.addon) {
      const [queues, channels, gateways, mcp, cli] = await Promise.all([
        workflow.do('Queue', 'pikkuQueue', null),
        workflow.do('Channels', 'pikkuChannels', null),
        workflow.do('Gateway', 'pikkuGateway', null),
        workflow.do('MCP', 'pikkuMCP', null),
        workflow.do('CLI', 'pikkuCLI', null),
      ])

      if (queues) {
        await Promise.all([
          workflow.do('Queue map', 'pikkuQueueMap', null),
          workflow.do('Queue service', 'pikkuQueueService', null),
        ])
        allImports.push(
          config.queueWorkersWiringMetaFile,
          config.queueWorkersWiringFile
        )
      }

      if (channels) {
        await Promise.all([
          workflow.do('Channels map', 'pikkuChannelsMap', null),
          workflow.do('WebSocket typed', 'pikkuWebSocketTyped', null),
        ])
        allImports.push(
          config.channelsWiringMetaFile,
          config.channelsWiringFile
        )
      }

      if (gateways) {
        allImports.push(config.gatewaysWiringFile)
      }

      if (mcp) {
        await workflow.do('MCP JSON', 'pikkuMCPJSON', null)
        allImports.push(config.mcpWiringsMetaFile, config.mcpWiringsFile)
      }

      if (cli) {
        await workflow.do('CLI entry', 'pikkuCLIEntry', null)
        allImports.push(config.cliWiringMetaFile, config.cliWiringsFile)
      }
    }

    await workflow.do('Nodes meta', 'pikkuNodesMeta', null)

    if (
      config.clientFiles?.nextBackendFile ||
      config.clientFiles?.nextHTTPFile
    ) {
      await workflow.do('Next.js', 'pikkuNext', null)
    }

    if (config.openAPI) {
      logger.debug(
        `• OpenAPI requires a reinspection to pickup new generated types..`
      )
      await workflow.do('OpenAPI re-inspect', async () =>
        getInspectorState(true)
      )
      await workflow.do('OpenAPI', 'pikkuOpenAPI', null)
    }

    await workflow.do('Versions update', 'pikkuVersionsUpdate', null)

    await workflow.do('Bootstrap', 'pikkuBootstrap', { allImports })
    await workflow.do('Summary', 'pikkuSummary', null)
  },
})
