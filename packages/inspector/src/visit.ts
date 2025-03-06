import * as ts from 'typescript'
import { addFileWithFactory } from './add-file-with-factory.js'
import { addFileExtendsCoreType } from './add-file-extends-core-type.js'
import { addRoute } from './add-http-route.js'
import { addSchedule } from './add-schedule.js'
import { addChannel } from './add-channel.js'
import { InspectorFilters, InspectorState } from './types.js'

export const visit = (
  checker: ts.TypeChecker,
  node: ts.Node,
  state: InspectorState,
  filters: InspectorFilters
) => {
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

  addRoute(node, checker, state, filters)
  addSchedule(node, checker, state, filters)
  addChannel(node, checker, state, filters)

  ts.forEachChild(node, (child) => visit(checker, child, state, filters))
}
