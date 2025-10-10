import * as ts from 'typescript'
import { addFileWithFactory } from './add-file-with-factory.js'
import { addFileExtendsCoreType } from './add-file-extends-core-type.js'
import { addHTTPRoute } from './add-http-route.js'
import { addSchedule } from './add-schedule.js'
import { addQueueWorker } from './add-queue-worker.js'
import { addMCPResource } from './add-mcp-resource.js'
import { addMCPTool } from './add-mcp-tool.js'
import { addMCPPrompt } from './add-mcp-prompt.js'
import { InspectorState, InspectorLogger, InspectorOptions } from './types.js'
import { addFunctions } from './add-functions.js'
import { addChannel } from './add-channel.js'
import { addRPCInvocations } from './add-rpc-invocations.js'
import { addMiddleware } from './add-middleware.js'
import { addPermission } from './add-permission.js'
import { addCLI } from './add-cli.js'

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
    state.sessionServicesTypeImportMap,
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
    state.sessionServicesFactories,
    'CreateSessionServices'
  )

  addFileWithFactory(node, checker, state.configFactories, 'CreateConfig')
  addRPCInvocations(node, state, logger)

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
  addMCPResource(logger, node, checker, state, options)
  addMCPTool(logger, node, checker, state, options)
  addMCPPrompt(logger, node, checker, state, options)
  addMiddleware(logger, node, checker, state, options)
  addPermission(logger, node, checker, state, options)

  ts.forEachChild(node, (child) =>
    visitRoutes(logger, checker, child, state, options)
  )
}
