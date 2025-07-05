import * as ts from 'typescript'
import { addFileWithFactory } from './add-file-with-factory.js'
import { addFileExtendsCoreType } from './add-file-extends-core-type.js'
import { addHTTPRoute } from './add-http-route.js'
import { addSchedule } from './add-schedule.js'
import { addQueueWorker } from './add-queue-worker.js'
import { addMCPResource } from './add-mcp-resource.js'
import { addMCPTool } from './add-mcp-tool.js'
import { addMCPPrompt } from './add-mcp-prompt.js'
import { InspectorFilters, InspectorState } from './types.js'
import { addFunctions } from './add-functions.js'
import { addChannel } from './add-channel.js'

export const visitSetup = (
  checker: ts.TypeChecker,
  node: ts.Node,
  state: InspectorState,
  filters: InspectorFilters
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
  addFunctions(node, checker, state, filters)

  ts.forEachChild(node, (child) => visitSetup(checker, child, state, filters))
}

export const visitRoutes = (
  checker: ts.TypeChecker,
  node: ts.Node,
  state: InspectorState,
  filters: InspectorFilters
) => {
  addHTTPRoute(node, checker, state, filters)
  addSchedule(node, checker, state, filters)
  addQueueWorker(node, checker, state, filters)
  addChannel(node, checker, state, filters)
  addMCPResource(node, checker, state, filters)
  addMCPTool(node, checker, state, filters)
  addMCPPrompt(node, checker, state, filters)
  ts.forEachChild(node, (child) => visitRoutes(checker, child, state, filters))
}
