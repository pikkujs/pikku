import { existsSync } from 'fs'
import { pikkuWorkflowComplexFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { assertSingleCoreVersion } from '../../utils/assert-single-core-version.js'
import {
  PikkuTypecheckFailedError,
  renderTscFull,
  renderTscSummary,
  runProjectTypecheck,
} from '../../utils/tsc-check.js'

type ScaffoldGenerator =
  | 'pikkuPublicRPC'
  | 'pikkuConsoleFunctions'
  | 'pikkuScenarioFunctions'
  | 'pikkuPublicAgent'
  | 'pikkuEventsScaffold'

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
  if (config.scaffold?.scenarios && config.scenariosFunctionsFile)
    files.push({
      file: config.scenariosFunctionsFile,
      generator: 'pikkuScenarioFunctions',
    })
  if (config.scaffold?.agent && config.publicAgentFile)
    files.push({
      file: config.publicAgentFile,
      generator: 'pikkuPublicAgent',
    })
  if (config.scaffold?.events && config.eventsChannelFile)
    files.push({
      file: config.eventsChannelFile,
      generator: 'pikkuEventsScaffold',
    })
  return files
}

export const allWorkflow = pikkuWorkflowComplexFunc<void, void>({
  title: 'Pikku All',
  func: async ({ logger, config, getInspectorState }, _data, { workflow }) => {
    // Preflight: a split @pikku/core install silently breaks wiring registration
    // (workflows/RPCs "disappear"), so refuse to codegen against it.
    await assertSingleCoreVersion(config.rootDir, logger)

    const allImports: string[] = []
    let typesDeclarationFileExists = true

    if (!existsSync(config.outDir)) {
      logger.debug(`• .pikku directory not found, running bootstrap first...`)
      await workflow.do('Bootstrap inspect', async () =>
        getInspectorState(false, true, true)
      )
      // Both before function types: pikku-types.gen.ts re-exports the scope
      // definition types and imports ScopeId from the scopes codegen, so any
      // later import of '#pikku' — the inspector reading a project's zod
      // schemas, for one — fails until these two files exist.
      await workflow.do(
        'Bootstrap scope definition types',
        'pikkuScopeDefinitionTypes',
        null
      )
      await workflow.do('Bootstrap scopes', 'pikkuScopes', { bootstrap: true })
      await workflow.do(
        'Bootstrap function types split',
        'pikkuFunctionTypesSplit',
        { bootstrap: true }
      )
      // Pre-write a stub auth.types.ts (if the project uses better-auth) so the
      // pikkuBetterAuth re-export resolves before any user file is imported.
      await workflow.do('Bootstrap auth types', 'pikkuAuth', {
        bootstrap: true,
      })
      await workflow.do('Bootstrap function types', 'pikkuFunctionTypes', {
        bootstrap: true,
      })
      await workflow.do('Bootstrap addon types', 'pikkuAddonTypes', {
        bootstrap: true,
      })
      await Promise.all([
        workflow.do('Bootstrap HTTP types', 'pikkuHTTPTypes', null),
        workflow.do('Bootstrap channel types', 'pikkuChannelTypes', null),
        workflow.do('Bootstrap scheduler types', 'pikkuSchedulerTypes', null),
        workflow.do('Bootstrap queue types', 'pikkuQueueTypes', null),
        workflow.do('Bootstrap workflow', 'pikkuWorkflow', {
          bootstrap: true,
        }),
        workflow.do('Bootstrap Trigger types', 'pikkuTriggerTypes', {
          bootstrap: true,
        }),
        workflow.do('Bootstrap MCP types', 'pikkuMCPTypes', null),
        workflow.do('Bootstrap AI agent types', 'pikkuAIAgentTypes', null),
      ])
      await workflow.do('Bootstrap Node types', 'pikkuNodeTypes', null)
      await workflow.do(
        'Bootstrap Secret definition types',
        'pikkuSecretDefinitionTypes',
        null
      )
      if (!config.addon) {
        await workflow.do('Bootstrap CLI types', 'pikkuCLITypes', {
          bootstrap: true,
        })
      }
      await workflow.do('Bootstrap re-inspect', async () =>
        getInspectorState(true, true)
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

    await workflow.do('Generate function types', 'pikkuFunctionTypes', {})

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
      workflow.do('Function types split', 'pikkuFunctionTypesSplit', {}),
      workflow.do('Trigger types', 'pikkuTriggerTypes', {}),
      workflow.do('AI agent types', 'pikkuAIAgentTypes', null),
    ]
    if (!config.addon) {
      typeGenerators.push(
        workflow.do('HTTP types', 'pikkuHTTPTypes', null),
        workflow.do('Channel types', 'pikkuChannelTypes', null),
        workflow.do('Scheduler types', 'pikkuSchedulerTypes', null),
        workflow.do('Queue types', 'pikkuQueueTypes', null),
        workflow.do('MCP types', 'pikkuMCPTypes', null)
      )
    }
    await Promise.all(typeGenerators)
    await workflow.do('Node types', 'pikkuNodeTypes', null)
    if (!config.addon) {
      await workflow.do('CLI types', 'pikkuCLITypes', null)
    }

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
      workflow.do('Scenario functions', 'pikkuScenarioFunctions', null),
      workflow.do('Events scaffold', 'pikkuEventsScaffold', null),
      workflow.do('Emails', 'pikkuEmails', null),
      workflow.do(
        'Secret definition types',
        'pikkuSecretDefinitionTypes',
        null
      ),
      workflow.do('Auth', 'pikkuAuth', {}),
      workflow.do('Secrets', 'pikkuSecrets', null),
      workflow.do('Credentials', 'pikkuCredentials', null),
      workflow.do('Scope definition types', 'pikkuScopeDefinitionTypes', null),
      workflow.do('Scopes', 'pikkuScopes', {}),
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

    // pikkuAuth generates auth-secrets.gen.ts (with wireSecret calls) inside the
    // Promise.all above, but pikkuSecrets runs concurrently from the pre-auth
    // inspector state. Re-run secret/credential/variable codegen now so that the
    // freshly-generated auth-secrets.gen.ts (just picked up by Re-inspect above)
    // is reflected in pikku-secrets-meta.gen.json.
    if ((await getInspectorState()).auth.definition) {
      await Promise.all([
        workflow.do('Secrets (post-auth)', 'pikkuSecrets', null),
        workflow.do('Credentials (post-auth)', 'pikkuCredentials', null),
        workflow.do('Variables (post-auth)', 'pikkuVariables', null),
      ])
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
        workflow.do('HTTP', 'pikkuCommandHTTP', null),
        workflow.do('Scheduler', 'pikkuScheduler', null),
        workflow.do('Trigger', 'pikkuTrigger', null),
      ])

      if (http) {
        await Promise.all([
          workflow.do('HTTP map', 'pikkuHTTPMap', null),
          workflow.do('Fetch', 'pikkuFetch', null),
          workflow.do('RPC client', 'pikkuRPCClient', null),
          workflow.do('React query', 'pikkuReactQuery', null),
          workflow.do('TanStack Start', 'pikkuTanStackStart', null),
          workflow.do('Realtime client', 'pikkuRealtime', null),
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
    if (config.addon) {
      await Promise.all([
        workflow.do('HTTP', 'pikkuCommandHTTP', null),
        workflow.do('Channels', 'pikkuCommandChannels', null),
        workflow.do('CLI', 'pikkuCLI', null),
      ])
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
        workflow.do('Queue', 'pikkuCommandQueue', null),
        workflow.do('Channels', 'pikkuCommandChannels', null),
        workflow.do('Gateway', 'pikkuGateway', null),
        workflow.do('MCP', 'pikkuMCP', null),
        workflow.do('CLI', 'pikkuCLI', null),
      ])

      if (queues) {
        await Promise.all([
          workflow.do('Queue map', 'pikkuCommandQueueMap', null),
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
        allImports.push(
          config.gatewaysWiringMetaFile,
          config.gatewaysWiringFile
        )
      }

      await workflow.do('MCP JSON', 'pikkuMCPJSON', null)
      if (mcp) {
        allImports.push(config.mcpWiringsMetaFile, config.mcpWiringsFile)
      }

      if (cli) {
        const cliChannelGenerated = await workflow.do(
          'CLI entry',
          'pikkuCLIEntry',
          null
        )
        allImports.push(config.cliWiringMetaFile, config.cliWiringsFile)

        if (cliChannelGenerated) {
          await workflow.do('Re-inspect after CLI channel', async () =>
            getInspectorState(true)
          )
          const cliChannels = await workflow.do(
            'Channels after CLI',
            'pikkuCommandChannels',
            null
          )
          await workflow.do('Functions after CLI', 'pikkuFunctions', null)
          await workflow.do('Schemas after CLI', 'pikkuSchemas', null)
          if (cliChannels) {
            await workflow.do(
              'Channels map after CLI',
              'pikkuChannelsMap',
              null
            )
            if (!channels) {
              allImports.push(
                config.channelsWiringMetaFile,
                config.channelsWiringFile
              )
            }
          }
        }
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

    // Opt-in type-check gate (--tsc / --tsc-summary). Runs last, over the
    // post-codegen project, so generated .pikku files are included — matching a
    // real build. Printed inside the step; the throw lives in the workflow body
    // (like assertSingleCoreVersion) so it reliably fails the run.
    if (config.tsc || config.tscSummary) {
      const errorCount = await workflow.do('Type check', async () => {
        const { result, diagnostics, formatHost } = runProjectTypecheck(
          config.tsconfig,
          config.rootDir
        )
        logger.info(
          config.tsc
            ? renderTscFull(diagnostics, config.rootDir, formatHost)
            : renderTscSummary(result)
        )
        return result.errorCount
      })
      if (errorCount > 0) {
        throw new PikkuTypecheckFailedError(
          `Type check failed: ${errorCount} error${errorCount === 1 ? '' : 's'}`
        )
      }
    }
  },
})
