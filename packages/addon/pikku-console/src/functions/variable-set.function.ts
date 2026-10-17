import { pikkuFunc } from '#pikku/addon/function'

export const variableSet = pikkuFunc<
  { variableId: string; value: unknown },
  { success: boolean }
>({
  title: 'Set Variable',
  description: 'Sets the value of a variable.',
  expose: true,
  scopes: ['pikku:console:variables:write'],
  func: async ({ variables }, { variableId, value }) => {
    await variables.set(variableId, value)
    return { success: true }
  },
})
