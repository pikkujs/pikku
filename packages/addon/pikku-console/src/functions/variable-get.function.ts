import { pikkuFunc } from '#pikku/addon/function'

export const variableGet = pikkuFunc<
  { variableId: string },
  { exists: boolean; value: unknown }
>({
  title: 'Get Variable',
  description: 'Gets the current value of a variable.',
  expose: true,
  scopes: ['pikku:console:variables:read'],
  func: async ({ variables }, { variableId }) => {
    if (!(await variables.has(variableId))) {
      return { exists: false, value: null }
    }
    return { exists: true, value: (await variables.get(variableId)) ?? null }
  },
})
