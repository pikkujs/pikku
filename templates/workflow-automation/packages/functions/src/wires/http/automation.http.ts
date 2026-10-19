import { wireHTTP } from '#pikku/http'
import { startFlowPublish } from '../automation.workflow.js'
import { runFlow } from '../../functions/run-flow.function.js'
import { cancelRun } from '../../functions/cancel-run.function.js'
import { listRuns } from '../../functions/list-runs.function.js'

/**
 * The operator-facing HTTP surface.
 *
 * There is no anonymous route here. A flow can reach anything the platform is
 * connected to, so "who asked for this run" is never a question the system
 * should have to guess at — every route is authenticated and every mutation is
 * audited on the function.
 */
// @snippet start wireHttp
wireHTTP({
  method: 'get',
  route: '/runs',
  func: listRuns,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/flows/:flowId/run',
  func: runFlow,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/runs/:runId/cancel',
  func: cancelRun,
  auth: true,
})
// @snippet end wireHttp

wireHTTP({
  method: 'post',
  route: '/flows/:flowId/publish',
  func: startFlowPublish,
  auth: true,
})
