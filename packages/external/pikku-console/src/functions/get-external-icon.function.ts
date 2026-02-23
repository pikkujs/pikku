import { pikkuSessionlessFunc } from '#pikku'

export const getExternalIcon = pikkuSessionlessFunc<{ alias: string }, string>({
  title: 'Get External Icon',
  description:
    'Given an alias string, reads and returns the SVG icon content for the corresponding external package by calling externalService.readExternalPackageIcon(alias)',
  expose: true,
  auth: false,
  func: async ({ externalService }, { alias }, { http }) => {
    // http?.response?.header("Content-Type", "image/svg+xml");
    return await externalService.readExternalPackageIcon(alias)
  },
})
