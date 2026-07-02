import { pikkuFunc } from '#pikku'
import type { AddonMeta } from '../services/addon.service.js'

export const getAddonMeta = pikkuFunc<null, AddonMeta[]>({
  title: 'Get Addon Metadata',
  description:
    'Returns an array of AddonMeta objects for all installed addons by reading from addonService.readAddonsMeta()',
  expose: true,
  func: async ({ addonService }) => {
    return await addonService.readAddonsMeta()
  },
})
