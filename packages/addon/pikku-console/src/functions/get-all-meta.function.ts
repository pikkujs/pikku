import { pikkuFunc } from '#pikku/addon/function'
import type { AddonFilter } from '../lib/addon-scope.js'
import { filterAllMetaByAddon } from '../services/wiring.service.js'
import type { AllMeta } from '../services/wiring.service.js'

export const getAllMeta = pikkuFunc<AddonFilter | null, AllMeta>({
  title: 'Get All Metadata',
  description:
    'Reads and returns a combined object containing metadata for every wiring type (HTTP, RPC, channels, schedulers, queues, workflows, CLI, MCP, gateways, triggers, trigger sources, services, functions, and secrets) by delegating to wiringService.readAllMeta(). With `addon`, only the items that add-on contributes are returned.',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ wiringService }, input) => {
    return filterAllMetaByAddon(await wiringService.readAllMeta(), input?.addon)
  },
})
