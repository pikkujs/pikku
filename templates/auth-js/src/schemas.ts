import { z } from 'zod'

export const PrioritySchema = z.enum(['low', 'medium', 'high'])
export type Priority = z.infer<typeof PrioritySchema>

export const TodoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  completed: z.boolean(),
  priority: PrioritySchema,
  dueDate: z.string().optional(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Todo = z.infer<typeof TodoSchema>

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
})
export type User = z.infer<typeof UserSchema>

export const CreateTodoInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: PrioritySchema.optional().default('medium'),
  dueDate: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
})
export type CreateTodoInput = z.infer<typeof CreateTodoInputSchema>

export const TodoIdInputSchema = z.object({
  id: z.string().describe('Todo ID'),
})

export const ListTodosInputSchema = z.object({
  completed: z.boolean().optional(),
  priority: PrioritySchema.optional(),
  tag: z.string().optional(),
})

export const TodoResponseSchema = z.object({
  todo: TodoSchema,
})

export const TodoListResponseSchema = z.object({
  todos: z.array(TodoSchema),
  total: z.number(),
})

export const TodoOutputSchema = z.object({
  todo: TodoSchema.nullable(),
})

export const CreateTodoOutputSchema = z.object({
  todo: TodoSchema,
})

export const DeleteResponseSchema = z.object({
  success: z.boolean(),
})
