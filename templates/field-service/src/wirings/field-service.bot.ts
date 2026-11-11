import {
  pikkuAgent,
  agent,
  agentStream,
} from '#pikku/agent/pikku-agent-types.gen.js'
import { wireHTTP } from '#pikku/http'
import { listJobs } from '../functions/jobs/list-jobs.function.js'
import { getJob } from '../functions/jobs/get-job.function.js'
import { listTechnicians } from '../functions/technicians/list-technicians.function.js'
import { assignJob } from '../functions/jobs/assign-job.function.js'

/**
 * The dispatch assistant.
 *
 * Every tool it holds is an ordinary pikku function that already exists for the
 * screens — the agent gets no private back door into the database, which is
 * what keeps its reach equal to its caller's. `assignJob` carries
 * `approvalRequired`, so the one tool with a consequence pauses for a person.
 */
export const dispatchAssistant = pikkuAgent({
  name: 'dispatch-assistant',
  description: 'Helps a dispatcher work through the morning board.',
  goal: 'Answer questions about the day’s jobs and propose who should go where. Never assign work without confirmation.',
  model: 'openai/gpt-4o-mini',
  tools: [listJobs, getJob, listTechnicians, assignJob],
  memory: { storage: 'aiStorage', lastMessages: 20 },
  maxSteps: 8,
})

wireHTTP({
  method: 'post',
  route: '/agents/dispatch',
  func: agent('dispatchAssistant'),
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/agents/dispatch/stream',
  func: agentStream('dispatchAssistant'),
  auth: true,
})
