import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const ResetTodosInput = z.object({})

export const ResetTodosOutput = z.object({
  success: z.boolean(),
})

export const resetTodos = pikkuSessionlessFunc({
  description: 'Resets all todos to their initial seed data',
  expose: true,
  input: ResetTodosInput,
  output: ResetTodosOutput,
  func: async ({ todoStore }) => {
    todoStore.reset()
    return { success: true }
  },
})
