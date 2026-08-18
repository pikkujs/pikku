import { pikkuFunc } from '#pikku/addon/function'

export const getAddonIcon = pikkuFunc<{ alias: string }, string | null>({
  title: 'Get Addon Icon',
  description: 'Returns the icon for an addon from its metadata',
  expose: true,
  scopes: ['pikku:console:addons:read'],
  func: async ({ addonService }, { alias }) => {
    const pkg = await addonService.readAddon(alias)
    return pkg?.icon ?? null
  },
})
