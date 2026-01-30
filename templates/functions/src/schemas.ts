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

export const ListTodosWithUserInputSchema = ListTodosInputSchema.extend({
  userId: z
    .string()
    .optional()
    .describe('User ID (uses demo user if not provided)'),
})

export const CreateTodoWithUserInputSchema = CreateTodoInputSchema.extend({
  userId: z
    .string()
    .optional()
    .describe('User ID (uses demo user if not provided)'),
})

export const TodoIdInputSchema = z.object({
  id: z.string().describe('Todo ID'),
})

export const UpdateTodoWithIdInputSchema = z.object({
  id: z.string().describe('Todo ID'),
  ...UpdateTodoInputSchema.shape,
})

export const TodoOutputSchema = z.object({
  todo: TodoSchema.nullable(),
})

export const TodoSuccessOutputSchema = z.object({
  todo: TodoSchema.nullable(),
  success: z.boolean(),
})

export const CreateTodoOutputSchema = z.object({
  todo: TodoSchema,
})

export const EmptyInputSchema = z.object({})

export const SuccessOutputSchema = z.object({
  success: z.boolean(),
})

export const EventTopicSchema = z.enum([
  'todo-created',
  'todo-updated',
  'todo-deleted',
  'todo-completed',
])

export const SubscribeInputSchema = z.object({
  topic: EventTopicSchema.describe('Event topic to subscribe to'),
})

export const SubscribeOutputSchema = z.object({
  subscribed: z.boolean(),
  topic: z.string(),
})

export const UnsubscribeInputSchema = z.object({
  topic: EventTopicSchema.describe('Event topic to unsubscribe from'),
})

export const UnsubscribeOutputSchema = z.object({
  unsubscribed: z.boolean(),
  topic: z.string(),
})

export const UserIdInputSchema = z.object({
  userId: z
    .string()
    .optional()
    .describe('User ID (uses demo user if not provided)'),
})

export const PrioritizePromptInputSchema = z.object({
  userId: z
    .string()
    .optional()
    .describe('User ID (uses demo user if not provided)'),
  focus: z
    .enum(['urgency', 'importance', 'quick-wins'])
    .optional()
    .describe('Prioritization focus'),
})

export const ProcessReminderInputSchema = z.object({
  todoId: z.string(),
  userId: z.string(),
})

export const ProcessReminderOutputSchema = z.object({
  processed: z.boolean(),
  message: z.string(),
})

export const TodoStreamOutputSchema = z.object({
  todos: z.array(TodoSchema),
  timestamp: z.string(),
  count: z.number(),
})

export const OnTestEventInputSchema = z.object({
  payload: z.string(),
})

export const OnTestEventOutputSchema = z.object({
  payload: z.string(),
})
