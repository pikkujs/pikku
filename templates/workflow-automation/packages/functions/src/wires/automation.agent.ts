import { pikkuAgent, agent } from '#pikku/agent'
import { wireHTTP } from '#pikku/http'
import { listRuns } from '../functions/list-runs.function.js'
import { cancelRun } from '../functions/cancel-run.function.js'

/**
 * An on-call assistant. `cancelRun` is a real, consequential tool — which is
 * why it goes through rpc.invoke and is gated by `runs:cancel` like any other
 * caller. An agent that could stop production work without holding the scope
 * would be the largest hole in the platform.
 */
export const opsAssistant = pikkuAgent({
  name: 'ops-assistant',
  description: 'Helps an operator work out why a flow failed.',
  goal: 'Explain recent run failures and cancel a run when asked to.',
  model: 'openai/gpt-4o-mini',
  tools: [listRuns, cancelRun],
  memory: { storage: 'aiStorage', lastMessages: 20 },
  maxSteps: 10,
})

wireHTTP({
  method: 'post',
  route: '/agents/ops',
  func: agent('opsAssistant'),
  auth: true,
})
