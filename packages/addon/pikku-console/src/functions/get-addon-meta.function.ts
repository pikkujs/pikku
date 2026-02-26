import { pikkuSessionlessFunc } from '#pikku'
import type { AddonMeta } from '../services/addon.service.js'

export const getAddonMeta = pikkuSessionlessFunc<null, AddonMeta[]>({
  title: 'Get Addon Metadata',
  description:
    'Returns an array of AddonMeta objects for all installed addons by reading from addonService.readAddonsMeta()',
  expose: true,
  auth: false,
  func: async ({ addonService }) => {
    return await addonService.readAddonsMeta()
  },
})
