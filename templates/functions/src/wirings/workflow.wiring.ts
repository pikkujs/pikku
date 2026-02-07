import { wireHTTP } from '../../.pikku/pikku-types.gen.js'
import {
  wireWorkflow,
  workflow,
  workflowStart,
  workflowStatus,
} from '../../.pikku/workflow/pikku-workflow-types.gen.js'
import { createAndNotifyWorkflow } from '../functions/workflow.functions.js'

wireWorkflow({
  func: createAndNotifyWorkflow,
})

wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/create-todo',
  func: workflowStart('createAndNotifyWorkflow'),
})

wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/run-todo',
  func: workflow('createAndNotifyWorkflow'),
})

wireHTTP({
  auth: false,
  method: 'get',
  route: '/workflow/status/:runId',
  func: workflowStatus('createAndNotifyWorkflow'),
})
