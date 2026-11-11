// Ensure HTTP metadata is loaded before calling wireHTTP
import '../../.pikku/http/pikku-http-wirings-meta.gen.js'

import { agentApprove } from '#pikku/agent'
import { wireHTTP } from '#pikku/http'

wireHTTP({
  method: 'post',
  route: '/agents/test-agent/approve',
  func: agentApprove('testAgent'),
  tags: ['session'],
})
