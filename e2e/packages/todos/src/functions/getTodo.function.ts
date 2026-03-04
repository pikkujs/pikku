import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const GetTodoInput = z.object({
  id: z.string(),
})

export const GetTodoOutput = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  createdAt: z.string(),
})

export const getTodo = pikkuSessionlessFunc({
  description: 'Returns a single todo by ID',
  input: GetTodoInput,
  output: GetTodoOutput,
  func: async ({ todoStore }, { id }) => {
    const todo = todoStore.get(id)
    if (!todo) {
      throw new Error(`Todo with id '${id}' not found`)
    }
    return todo
  },
})
