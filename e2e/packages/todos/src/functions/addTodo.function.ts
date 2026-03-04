import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const AddTodoInput = z.object({
  title: z.string(),
})

export const AddTodoOutput = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  createdAt: z.string(),
})

export const addTodo = pikkuSessionlessFunc({
  description: 'Adds a new todo',
  approvalRequired: true,
  input: AddTodoInput,
  output: AddTodoOutput,
  func: async ({ todoStore }, { title }) => {
    return todoStore.add(title)
  },
})
