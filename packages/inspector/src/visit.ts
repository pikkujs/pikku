import * as ts from 'typescript'
import { addFileWithFactory } from './add/add-file-with-factory.js'
import { addFileExtendsCoreType } from './add/add-file-extends-core-type.js'
import { addHTTPRoute } from './add/add-http-route.js'
import { addHTTPRoutes } from './add/add-http-routes.js'
import { checkAddonBans } from './add/add-addon-bans.js'
import { addSchedule } from './add/add-schedule.js'
import { addTrigger } from './add/add-trigger.js'
import { addQueueWorker } from './add/add-queue-worker.js'
import { addWorkflow } from './add/add-workflow.js'
import { addMCPResource } from './add/add-mcp-resource.js'
import { addMCPPrompt } from './add/add-mcp-prompt.js'
import type {
  InspectorState,
  InspectorLogger,
  InspectorOptions,
} from './types.js'
import { addFunctions } from './add/add-functions.js'
import { addChannel } from './add/add-channel.js'
import { addGateway } from './add/add-gateway.js'
import { addRPCInvocations } from './add/add-rpc-invocations.js'
import { addWireAddon } from './add/add-wire-addon.js'
import { addMiddleware } from './add/add-middleware.js'
import { addPermission } from './add/add-permission.js'
import { addCLI, addCLIRenderers } from './add/add-cli.js'
import { addAuth } from './add/add-auth.js'
import { addSecret } from './add/add-secret.js'
import { addCredential } from './add/add-credential.js'
import { addVariable } from './add/add-variable.js'
import { addWorkflowGraph } from './add/add-workflow-graph.js'
import { addAIAgent } from './add/add-ai-agent.js'
import { addApprovalDescription } from './add/add-approval-description.js'

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
    'CreateSingletonServices',
    state
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
  addWireAddon(node, state, logger)
  addMiddleware(logger, node, checker, state, options)
  addPermission(logger, node, checker, state, options)
  addApprovalDescription(logger, node, checker, state, options)
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
  const nextOptions = ts.isSourceFile(node)
    ? { ...options, sourceFile: node }
    : options

  checkAddonBans(logger, node, checker, state, nextOptions)

  addFunctions(logger, node, checker, state, nextOptions)
  addAuth(logger, node, checker, state, nextOptions)
  addSecret(logger, node, checker, state, nextOptions)
  addCredential(logger, node, checker, state, nextOptions)
  addVariable(logger, node, checker, state, nextOptions)

  addHTTPRoute(logger, node, checker, state, nextOptions)
  addHTTPRoutes(logger, node, checker, state, nextOptions)
  addSchedule(logger, node, checker, state, nextOptions)
  addTrigger(logger, node, checker, state, nextOptions)
  addQueueWorker(logger, node, checker, state, nextOptions)
  addChannel(logger, node, checker, state, nextOptions)
  addGateway(logger, node, checker, state, nextOptions)
  addCLI(logger, node, checker, state, nextOptions)
  addCLIRenderers(logger, node, checker, state, nextOptions)
  addMCPResource(logger, node, checker, state, nextOptions)
  addMCPPrompt(logger, node, checker, state, nextOptions)
  addWorkflowGraph(logger, node, checker, state, nextOptions)
  addAIAgent(logger, node, checker, state, nextOptions)

  ts.forEachChild(node, (child) =>
    visitRoutes(logger, checker, child, state, nextOptions)
  )
}
