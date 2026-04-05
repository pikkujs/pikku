import { wireHTTP } from '../../.pikku/pikku-types.gen.js'
import {
  workflow,
  workflowStart,
  workflowStatus,
} from '../../.pikku/workflow/pikku-workflow-types.gen.js'

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
