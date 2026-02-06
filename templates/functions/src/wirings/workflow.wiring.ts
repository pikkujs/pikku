import { wireHTTP, workflow } from '../../.pikku/pikku-types.gen.js'
import { wireWorkflow } from '../../.pikku/workflow/pikku-workflow-types.gen.js'
import { createAndNotifyWorkflow } from '../functions/workflow.functions.js'

wireWorkflow({
  func: createAndNotifyWorkflow,
})

wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/create-todo',
  func: workflow('createAndNotifyWorkflow'),
})
