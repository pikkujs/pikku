import { z } from 'zod'

// Priority enum
export const PrioritySchema = z.enum(['low', 'medium', 'high'])
export type Priority = z.infer<typeof PrioritySchema>

// Todo schema
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

// User schema (for auth)
export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
})
export type User = z.infer<typeof UserSchema>

// Input schemas
export const CreateTodoInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: PrioritySchema.default('medium'),
  dueDate: z.string().optional(),
  tags: z.array(z.string()).default([]),
})
export type CreateTodoInput = z.infer<typeof CreateTodoInputSchema>

export const UpdateTodoInputSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: PrioritySchema.optional(),
  dueDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  completed: z.boolean().optional(),
})
export type UpdateTodoInput = z.infer<typeof UpdateTodoInputSchema>

export const ListTodosInputSchema = z.object({
  completed: z.boolean().optional(),
  priority: PrioritySchema.optional(),
  tag: z.string().optional(),
})
export type ListTodosInput = z.infer<typeof ListTodosInputSchema>

export const LoginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})
export type LoginInput = z.infer<typeof LoginInputSchema>

// Output schemas
export const TodoResponseSchema = z.object({
  todo: TodoSchema,
})

export const TodoListResponseSchema = z.object({
  todos: z.array(TodoSchema),
  total: z.number(),
})

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
})

export const UserResponseSchema = z.object({
  user: UserSchema,
})

export const DeleteResponseSchema = z.object({
  success: z.boolean(),
})
