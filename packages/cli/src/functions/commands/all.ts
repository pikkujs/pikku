import { existsSync } from 'fs'
import { pikkuVoidFunc } from '#pikku'

export const all = pikkuVoidFunc({
  remote: true,
  func: async ({ logger, config, getInspectorState }, _data, { rpc }) => {
    const allImports: string[] = []
    let typesDeclarationFileExists = true

    if (!existsSync(config.typesDeclarationFile)) {
      typesDeclarationFileExists = false
    }

    await rpc.invoke('pikkuFunctionTypes', null)

    if (!typesDeclarationFileExists) {
      logger.debug(`• Type file first created, inspecting again...`)
      await getInspectorState(true)
    }

    await rpc.invoke('pikkuFunctionTypesSplit', null)

    await rpc.invoke('pikkuTriggerTypes', null)

    await rpc.invoke('pikkuAIAgentTypes', null)

    if (!config.externalPackage) {
      await rpc.invoke('pikkuHTTPTypes', null)
      await rpc.invoke('pikkuChannelTypes', null)
      await rpc.invoke('pikkuSchedulerTypes', null)
      await rpc.invoke('pikkuQueueTypes', null)
      await rpc.invoke('pikkuMCPTypes', null)
      await rpc.invoke('pikkuCLITypes', null)
    }

    const middleware = await rpc.invoke('pikkuMiddleware', null)
    if (middleware) {
      allImports.push(config.middlewareFile)
    }

    const permissions = await rpc.invoke('pikkuPermissions', null)
    if (permissions) {
      allImports.push(config.permissionsFile)
    }

    await rpc.invoke('pikkuServices', null)

    const hasPackageFactories = await rpc.invoke('pikkuPackage', null)
    if (hasPackageFactories) {
      allImports.push(config.packageFile)
    }

    const hasInternalRPCs = await rpc.invoke('pikkuRPC', null)

    const agents = await rpc.invoke('pikkuAIAgent', null)
    if (agents) {
      allImports.push(config.agentWiringMetaFile, config.agentWiringsFile)
      if (config.agent?.publicAgentPath) {
        await rpc.invoke('pikkuPublicAgent', null)
      }
    }

    await rpc.invoke('pikkuPublicRPC', null)
    await rpc.invoke('pikkuRPCClient', null)
    await rpc.invoke('pikkuConsoleFunctions', null)
    await rpc.invoke('pikkuNodeTypes', null)
    await rpc.invoke('pikkuSecretDefinitionTypes', null)
    await rpc.invoke('pikkuSecrets', null)
    await rpc.invoke('pikkuVariableDefinitionTypes', null)
    await rpc.invoke('pikkuVariables', null)

    await rpc.invoke('pikkuExternalTypes', null)

    if (hasInternalRPCs) {
      allImports.push(config.rpcInternalWiringMetaFile)
    }

    if (agents || !config.externalPackage) {
      await getInspectorState(true)
    }

    const schemas = await rpc.invoke('pikkuSchemas', null)
    if (schemas) {
      allImports.push(`${config.schemaDirectory}/register.gen.ts`)
    }

    await rpc.invoke('pikkuRPCInternalMap', null)
    await rpc.invoke('pikkuRPCExposedMap', null)

    if (!config.externalPackage) {
      const http = await rpc.invoke('pikkuHTTP', null)
      if (http) {
        await rpc.invoke('pikkuHTTPMap', null)
        await rpc.invoke('pikkuFetch', null)
        allImports.push(config.httpWiringMetaFile, config.httpWiringsFile)
      }

      const scheduler = await rpc.invoke('pikkuScheduler', null)
      if (scheduler) {
        allImports.push(
          config.schedulersWiringMetaFile,
          config.schedulersWiringFile
        )
      }

      const triggers = await rpc.invoke('pikkuTrigger', null)
      if (triggers) {
        allImports.push(
          config.triggersWiringMetaFile,
          config.triggerSourcesMetaFile,
          config.triggersWiringFile
        )
      }
    }

    const workflows = await rpc.invoke('pikkuWorkflow', null)

    let remoteRPC = false
    if (!config.externalPackage) {
      remoteRPC = await rpc.invoke('pikkuRemoteRPC', null)
    }

    if (workflows || remoteRPC) {
      await getInspectorState(true)
      await rpc.invoke('pikkuSchemas', null)
    }

    const hasFunctionRegistrations = await rpc.invoke('pikkuFunctions', null)
    allImports.push(config.functionsMetaFile)
    if (hasFunctionRegistrations) {
      allImports.push(config.functionsFile)
    }

    if (workflows) {
      allImports.push(config.workflowsWiringFile)
    }

    if (!config.externalPackage) {
      const queues = await rpc.invoke('pikkuQueue', null)
      if (queues) {
        await rpc.invoke('pikkuQueueMap', null)
        await rpc.invoke('pikkuQueueService', null)
        allImports.push(
          config.queueWorkersWiringMetaFile,
          config.queueWorkersWiringFile
        )
      }

      const channels = await rpc.invoke('pikkuChannels', null)
      if (channels) {
        await rpc.invoke('pikkuChannelsMap', null)
        await rpc.invoke('pikkuWebSocketTyped', null)
        allImports.push(
          config.channelsWiringMetaFile,
          config.channelsWiringFile
        )
      }

      const mcp = await rpc.invoke('pikkuMCP', null)
      if (mcp) {
        await rpc.invoke('pikkuMCPJSON', null)
        allImports.push(config.mcpWiringsMetaFile, config.mcpWiringsFile)
      }

      const cli = await rpc.invoke('pikkuCLI', null)
      if (cli) {
        await rpc.invoke('pikkuCLIEntry', null)
        allImports.push(config.cliWiringMetaFile, config.cliWiringsFile)
      }
    }

    await rpc.invoke('pikkuNodesMeta', null)

    if (config.nextBackendFile || config.nextHTTPFile) {
      await rpc.invoke('pikkuNext', null)
    }

    if (config.openAPI) {
      logger.debug(
        `• OpenAPI requires a reinspection to pickup new generated types..`
      )
      await getInspectorState(true)
      await rpc.invoke('pikkuOpenAPI', null)
    }

    try {
      await rpc.invoke('pikkuVersionsUpdate', null)
    } catch {
      logger.warn(`Run 'pikku init' to enable contract versioning.`)
    }

    await rpc.invoke('pikkuBootstrap', { allImports })
    await rpc.invoke('pikkuSummary', null)
  },
})
