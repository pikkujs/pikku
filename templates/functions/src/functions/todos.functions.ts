import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { store } from '../services/store.service.js'
import {
  CreateTodoInputSchema,
  UpdateTodoInputSchema,
  ListTodosInputSchema,
  TodoSchema,
} from '../schemas.js'

/**
 * List todos for a user with optional filters.
 */
export const listTodos = pikkuSessionlessFunc({
  input: ListTodosInputSchema.extend({
    userId: z
      .string()
      .optional()
      .describe('User ID (uses demo user if not provided)'),
  }),
  output: z.object({
    todos: z.array(TodoSchema),
    total: z.number(),
  }),
  func: async ({ logger }, { userId, completed, priority, tag }) => {
    const uid = userId || 'user1' // Default to demo user
    const todos = store.getTodosByUser(uid, { completed, priority, tag })
    logger.info(`Listed ${todos.length} todos for user ${uid}`)
    return { todos, total: todos.length }
  },
})

/**
 * Get a single todo by ID.
 */
export const getTodo = pikkuSessionlessFunc({
  input: z.object({
    id: z.string().describe('Todo ID'),
  }),
  output: z.object({
    todo: TodoSchema.nullable(),
  }),
  func: async ({ logger }, { id }) => {
    const todo = store.getTodo(id)
    logger.info(`Get todo ${id}: ${todo ? 'found' : 'not found'}`)
    return { todo: todo || null }
  },
})

/**
 * Create a new todo.
 */
export const createTodo = pikkuSessionlessFunc({
  input: CreateTodoInputSchema.extend({
    userId: z
      .string()
      .optional()
      .describe('User ID (uses demo user if not provided)'),
  }),
  output: z.object({
    todo: TodoSchema,
  }),
  func: async (
    { logger, eventHub },
    { userId, title, description, priority, dueDate, tags }
  ) => {
    const uid = userId || 'user1'
    const todo = store.createTodo(uid, {
      title,
      description,
      completed: false,
      priority: priority || 'medium',
      dueDate,
      tags: tags || [],
    })
    logger.info(`Created todo ${todo.id} for user ${uid}`)

    // Broadcast to all subscribers (null = all)
    if (eventHub) {
      await eventHub.publish('todo-created', null, { todo })
    }

    return { todo }
  },
})

/**
 * Update an existing todo.
 */
export const updateTodo = pikkuSessionlessFunc({
  input: z.object({
    id: z.string().describe('Todo ID'),
    ...UpdateTodoInputSchema.shape,
  }),
  output: z.object({
    todo: TodoSchema.nullable(),
    success: z.boolean(),
  }),
  func: async (
    { logger, eventHub },
    { id, title, description, priority, dueDate, tags, completed }
  ) => {
    const todo = store.updateTodo(id, {
      title,
      description,
      priority,
      dueDate,
      tags,
      completed,
    })

    if (todo) {
      logger.info(`Updated todo ${id}`)
      if (eventHub) {
        await eventHub.publish('todo-updated', null, { todo })
      }
    }

    return { todo: todo || null, success: !!todo }
  },
})

/**
 * Delete a todo.
 */
export const deleteTodo = pikkuSessionlessFunc({
  input: z.object({
    id: z.string().describe('Todo ID'),
  }),
  output: z.object({
    success: z.boolean(),
  }),
  func: async ({ logger, eventHub }, { id }) => {
    const success = store.deleteTodo(id)
    logger.info(`Deleted todo ${id}: ${success}`)

    if (eventHub && success) {
      await eventHub.publish('todo-deleted', null, { todoId: id })
    }

    return { success }
  },
})

/**
 * Mark a todo as complete.
 */
export const completeTodo = pikkuSessionlessFunc({
  input: z.object({
    id: z.string().describe('Todo ID'),
  }),
  output: z.object({
    todo: TodoSchema.nullable(),
    success: z.boolean(),
  }),
  func: async ({ logger, eventHub }, { id }) => {
    const todo = store.completeTodo(id)

    if (todo) {
      logger.info(`Completed todo ${id}`)
      if (eventHub) {
        await eventHub.publish('todo-completed', null, { todo })
      }
    }

    return { todo: todo || null, success: !!todo }
  },
})
