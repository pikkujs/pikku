import * as ts from 'typescript'
import { addFileWithFactory } from './add/add-file-with-factory.js'
import { addFileExtendsCoreType } from './add/add-file-extends-core-type.js'
import { addHTTPRoute } from './add/add-http-route.js'
import { addSchedule } from './add/add-schedule.js'
import { addQueueWorker } from './add/add-queue-worker.js'
import { addWorkflow } from './add/add-workflow.js'
import { addMCPResource } from './add/add-mcp-resource.js'
import { addMCPTool } from './add/add-mcp-tool.js'
import { addMCPPrompt } from './add/add-mcp-prompt.js'
import { InspectorState, InspectorLogger, InspectorOptions } from './types.js'
import { addFunctions } from './add/add-functions.js'
import { addChannel } from './add/add-channel.js'
import { addRPCInvocations } from './add/add-rpc-invocations.js'
import { addMiddleware } from './add/add-middleware.js'
import { addPermission } from './add/add-permission.js'
import { addCLI, addCLIRenderers } from './add/add-cli.js'
import { addForgeNode } from './add/add-forge-node.js'
import { addForgeCredential } from './add/add-forge-credential.js'
import { addWorkflowGraph } from './add/add-workflow-graph.js'

export const visitSetup = (
  logger: InspectorLogger,
  checker: ts.TypeChecker,
  node: ts.Node,
  state: InspectorState,
  options: InspectorOptions
) => {
  addFileExtendsCoreType(
    node,
    checker,
    state.singletonServicesTypeImportMap,
    'CoreSingletonServices',
    state
  )

  addFileExtendsCoreType(
    node,
    checker,
    state.wireServicesTypeImportMap,
    'CoreServices',
    state
  )

  addFileExtendsCoreType(
    node,
    checker,
    state.userSessionTypeImportMap,
    'CoreUserSession',
    state
  )

  addFileExtendsCoreType(
    node,
    checker,
    state.configTypeImportMap,
    'CoreConfig',
    state
  )

  addFileWithFactory(
    node,
    checker,
    state.singletonServicesFactories,
    'CreateSingletonServices'
  )

  addFileWithFactory(
    node,
    checker,
    state.wireServicesFactories,
    'CreateWireServices',
    state
  )

  addFileWithFactory(node, checker, state.configFactories, 'CreateConfig')

  addRPCInvocations(node, state, logger)
  addMiddleware(logger, node, checker, state, options)
  addPermission(logger, node, checker, state, options)
  addWorkflow(logger, node, checker, state, options)

  ts.forEachChild(node, (child) =>
    visitSetup(logger, checker, child, state, options)
  )
}

export const visitRoutes = (
  logger: InspectorLogger,
  checker: ts.TypeChecker,
  node: ts.Node,
  state: InspectorState,
  options: InspectorOptions
) => {
  addFunctions(logger, node, checker, state, options)
  addHTTPRoute(logger, node, checker, state, options)
  addSchedule(logger, node, checker, state, options)
  addQueueWorker(logger, node, checker, state, options)
  addChannel(logger, node, checker, state, options)
  addCLI(logger, node, checker, state, options)
  addCLIRenderers(logger, node, checker, state, options)
  addMCPResource(logger, node, checker, state, options)
  addMCPTool(logger, node, checker, state, options)
  addMCPPrompt(logger, node, checker, state, options)
  addForgeNode(logger, node, checker, state, options)
  addForgeCredential(logger, node, checker, state, options)
  addWorkflowGraph(logger, node, checker, state, options)

  ts.forEachChild(node, (child) =>
    visitRoutes(logger, checker, child, state, options)
  )
}
