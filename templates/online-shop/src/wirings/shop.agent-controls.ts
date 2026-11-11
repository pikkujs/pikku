import { agentApprove, agentResume } from '#pikku/agent'
import { wireHTTP } from '#pikku/http'

// @snippet start agentApproval
// The ops agent can cancel an order, so its tool calls wait for a human. These
// two routes are the human's side of that pause.
wireHTTP({
  method: 'post',
  route: '/agents/ops/approve',
  func: agentApprove('opsAgent'),
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/agents/ops/resume',
  func: agentResume(),
  auth: true,
})
// @snippet end agentApproval
