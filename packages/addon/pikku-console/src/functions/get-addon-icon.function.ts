import { pikkuFunc } from '#pikku'

export const getAddonIcon = pikkuFunc<{ alias: string }, string | null>({
  title: 'Get Addon Icon',
  description: 'Returns the icon for an addon from its metadata',
  expose: true,
  func: async ({ addonService }, { alias }) => {
    const pkg = await addonService.readAddon(alias)
    return pkg?.icon ?? null
  },
})
