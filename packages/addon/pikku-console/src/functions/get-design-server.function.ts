import { pikkuFunc } from '#pikku/addon/function'

export const getDesignServer = pikkuFunc<null, { url: string | null }>({
  title: 'Get Design Server',
  description:
    'Where the design server started by `pikku dev` is listening, or null when @pikku/design-server is not installed.',
  expose: true,
  scopes: ['pikku:console:design:read'],
  func: async ({ variables }) => ({
    url: (await variables.get('PIKKU_DESIGN_SERVER_URL')) ?? null,
  }),
})
