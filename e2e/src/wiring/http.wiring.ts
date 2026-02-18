import { wireHTTP } from '../../.pikku/http/pikku-http-types.gen.js'
import {
  getWorkflowRun,
  getWorkflowRunHistory,
  healthCheck,
  invokeRPC,
  resumeWorkflowRun,
  startWorkflowRun,
  startTaskCrudRun,
} from '../functions/workflow-api.functions.js'
import { processItem } from '../functions/task.functions.js'
import { enableSessionFromHeader } from '../security.js'

enableSessionFromHeader()

wireHTTP({
  method: 'get',
  route: '/health',
  auth: false,
  func: healthCheck,
})

wireHTTP({
  method: 'post',
  route: '/api/workflows/task-crud/start',
  func: startTaskCrudRun,
})

wireHTTP({
  method: 'post',
  route: '/api/process-item',
  auth: false,
  func: processItem,
})

wireHTTP({
  method: 'post',
  route: '/api/workflows/start',
  func: startWorkflowRun,
})

wireHTTP({
  method: 'get',
  route: '/api/workflows/:runId',
  func: getWorkflowRun,
})

wireHTTP({
  method: 'get',
  route: '/api/workflows/:runId/history',
  func: getWorkflowRunHistory,
})

wireHTTP({
  method: 'post',
  route: '/api/workflows/:runId/resume',
  func: resumeWorkflowRun,
})

wireHTTP({
  method: 'post',
  route: '/api/rpc/invoke',
  func: invokeRPC,
})
