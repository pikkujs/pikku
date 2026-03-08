import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const CompleteTodoInput = z.object({
  id: z.string(),
})

export const CompleteTodoOutput = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  createdAt: z.string(),
})

export const completeTodo = pikkuSessionlessFunc({
  description: 'Marks a todo as completed',
  input: CompleteTodoInput,
  output: CompleteTodoOutput,
  func: async ({ todoStore }, { id }) => {
    const todo = todoStore.complete(id)
    if (!todo) {
      throw new Error(`Todo with id '${id}' not found`)
    }
    return todo
  },
})
