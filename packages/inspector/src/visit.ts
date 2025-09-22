import * as ts from 'typescript'
import { addFileWithFactory } from './add-file-with-factory.js'
import { addFileExtendsCoreType } from './add-file-extends-core-type.js'
import { addHTTPRoute } from './add-http-route.js'
import { addSchedule } from './add-schedule.js'
import { addQueueWorker } from './add-queue-worker.js'
import { addMCPResource } from './add-mcp-resource.js'
import { addMCPTool } from './add-mcp-tool.js'
import { addMCPPrompt } from './add-mcp-prompt.js'
import { InspectorFilters, InspectorState, InspectorLogger } from './types.js'
import { addFunctions } from './add-functions.js'
import { addChannel } from './add-channel.js'
import { addRPCInvocations } from './add-rpc-invocations.js'
import { addMiddleware } from './add-middleware.js'
import { addPermission } from './add-permission.js'
import { addCLI } from './add-cli.js'

export const visitSetup = (
  checker: ts.TypeChecker,
  node: ts.Node,
  state: InspectorState,
  filters: InspectorFilters,
  logger: InspectorLogger
) => {
  addFileExtendsCoreType(
    node,
    checker,
    state.singletonServicesTypeImportMap,
    'CoreSingletonServices'
  )

  addFileExtendsCoreType(
    node,
    checker,
    state.sessionServicesTypeImportMap,
    'CoreServices'
  )

  addFileExtendsCoreType(
    node,
    checker,
    state.userSessionTypeImportMap,
    'CoreUserSession'
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
    state.sessionServicesFactories,
    'CreateSessionServices'
  )

  addFileWithFactory(node, checker, state.configFactories, 'CreateConfig')
  addRPCInvocations(node, state, logger)

  ts.forEachChild(node, (child) =>
    visitSetup(checker, child, state, filters, logger)
  )
}

export const visitRoutes = (
  checker: ts.TypeChecker,
  node: ts.Node,
  state: InspectorState,
  filters: InspectorFilters,
  logger: InspectorLogger
) => {
  addFunctions(node, checker, state, logger)
  addHTTPRoute(node, checker, state, filters, logger)
  addSchedule(node, checker, state, filters, logger)
  addQueueWorker(node, checker, state, filters, logger)
  addChannel(node, checker, state, filters, logger)
  addCLI(node as ts.CallExpression, node.getSourceFile(), state, checker)
  addMCPResource(node, checker, state, filters, logger)
  addMCPTool(node, checker, state, filters, logger)
  addMCPPrompt(node, checker, state, filters, logger)
  addMiddleware(node, checker, state, logger)
  addPermission(node, checker, state, logger)

  ts.forEachChild(node, (child) =>
    visitRoutes(checker, child, state, filters, logger)
  )
}
