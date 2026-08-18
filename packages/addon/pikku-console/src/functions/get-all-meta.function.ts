import { pikkuFunc } from '#pikku/addon/function'
import type { AllMeta } from '../services/wiring.service.js'

export const getAllMeta = pikkuFunc<null, AllMeta>({
  title: 'Get All Metadata',
  description:
    'Reads and returns a combined object containing metadata for every wiring type (HTTP, RPC, channels, schedulers, queues, workflows, CLI, MCP, gateways, triggers, trigger sources, services, functions, and secrets) by delegating to wiringService.readAllMeta()',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ wiringService }) => {
    return await wiringService.readAllMeta()
  },
})
