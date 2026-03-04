import { pikkuFunc } from '../../.pikku/pikku-types.gen.js'
import {
  ListTodosInputSchema,
  TodoIdInputSchema,
  CreateTodoInputSchema,
  TodoListResponseSchema,
  TodoOutputSchema,
  CreateTodoOutputSchema,
  DeleteResponseSchema,
} from '../schemas.js'

export const listTodos = pikkuFunc({
  input: ListTodosInputSchema,
  output: TodoListResponseSchema,
  func: async ({ todoStore }, { completed, priority, tag }, { session }) => {
    const todos = todoStore.getTodosByUser(session.userId, {
      completed,
      priority,
      tag,
    })
    return { todos, total: todos.length }
  },
})

export const getTodo = pikkuFunc({
  input: TodoIdInputSchema,
  output: TodoOutputSchema,
  func: async ({ todoStore }, { id }) => {
    const todo = todoStore.getTodo(id)
    return { todo: todo || null }
  },
})

export const createTodo = pikkuFunc({
  input: CreateTodoInputSchema,
  output: CreateTodoOutputSchema,
  func: async (
    { todoStore },
    { title, description, priority, dueDate, tags },
    { session }
  ) => {
    const todo = todoStore.createTodo(session.userId, {
      title,
      description,
      completed: false,
      priority: priority || 'medium',
      dueDate,
      tags: tags || [],
    })
    return { todo }
  },
})

export const deleteTodo = pikkuFunc({
  input: TodoIdInputSchema,
  output: DeleteResponseSchema,
  func: async ({ todoStore }, { id }) => {
    const success = todoStore.deleteTodo(id)
    return { success }
  },
})
