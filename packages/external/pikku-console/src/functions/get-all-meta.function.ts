import { pikkuSessionlessFunc } from '#pikku'
import type { AllMeta } from '../services/wiring.service.js'

export const getAllMeta = pikkuSessionlessFunc<null, AllMeta>({
  title: 'Get All Metadata',
  description:
    'Reads and returns a combined object containing metadata for every wiring type (HTTP, RPC, channels, schedulers, queues, workflows, CLI, MCP, triggers, trigger sources, services, functions, and secrets) by delegating to wiringService.readAllMeta()',
  expose: true,
  auth: false,
  func: async ({ wiringService }) => {
    return await wiringService.readAllMeta()
  },
})
