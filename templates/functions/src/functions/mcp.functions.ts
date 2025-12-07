import {
  pikkuMCPPromptFunc,
  pikkuMCPResourceFunc,
  pikkuMCPToolFunc,
} from '../../.pikku/pikku-types.gen.js'
import {
  UserIdInputSchema,
  PrioritizePromptInputSchema,
  type Todo,
} from '../schemas.js'

/**
 * Helper to format a todo for display
 */
const formatTodo = (todo: Todo): string => {
  const status = todo.completed ? '[x]' : '[ ]'
  const priority = `[${todo.priority.toUpperCase()}]`
  const due = todo.dueDate ? ` (due: ${todo.dueDate})` : ''
  const tags = todo.tags.length > 0 ? ` #${todo.tags.join(' #')}` : ''
  return `${status} ${priority} ${todo.id}: ${todo.title}${due}${tags}`
}

// =============================================================================
// MCP Resources - for reading data
// =============================================================================

/**
 * MCP Resource: Get a specific todo
 */
export const getTodoResource = pikkuMCPResourceFunc<{ id: string }>(
  async (_services, { id }, { rpc, mcp }) => {
    const result = await rpc.invoke('getTodo', { id })

    if (!result.todo) {
      return [
        {
          uri: mcp.uri!,
          text: `Todo "${id}" not found.`,
        },
      ]
    }

    const todo = result.todo
    const text = [
      `ID: ${todo.id}`,
      `Title: ${todo.title}`,
      `Status: ${todo.completed ? 'Completed' : 'Pending'}`,
      `Priority: ${todo.priority}`,
      todo.description ? `Description: ${todo.description}` : null,
      todo.dueDate ? `Due: ${todo.dueDate}` : null,
      todo.tags.length > 0 ? `Tags: ${todo.tags.join(', ')}` : null,
      `Created: ${todo.createdAt}`,
      `Updated: ${todo.updatedAt}`,
    ]
      .filter(Boolean)
      .join('\n')

    return [
      {
        uri: mcp.uri!,
        text,
      },
    ]
  }
)

// =============================================================================
// MCP Tools - for mutations/actions
// =============================================================================

/**
 * MCP Tool: Create a new todo
 */
export const createTodoTool = pikkuMCPToolFunc<{
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
  dueDate?: string
  tags?: string[]
  userId?: string
}>(async (_services, data, { rpc }) => {
  const result = await rpc.invoke('createTodo', data as any)

  return [
    {
      type: 'text',
      text: `Created todo: ${formatTodo(result.todo)}`,
    },
  ]
})

/**
 * MCP Tool: Mark a todo as complete
 */
export const completeTodoTool = pikkuMCPToolFunc<{ id: string }>(
  async (_services, { id }, { rpc }) => {
    const result = await rpc.invoke('completeTodo', { id })

    if (!result.success || !result.todo) {
      return [
        {
          type: 'text',
          text: `Failed to complete todo "${id}". It may not exist.`,
        },
      ]
    }

    return [
      {
        type: 'text',
        text: `Completed: ${formatTodo(result.todo)}`,
      },
    ]
  }
)

/**
 * MCP Tool: Delete a todo
 */
export const deleteTodoTool = pikkuMCPToolFunc<{ id: string }>(
  async (_services, { id }, { rpc }) => {
    const result = await rpc.invoke('deleteTodo', { id })

    return [
      {
        type: 'text',
        text: result.success
          ? `Deleted todo "${id}".`
          : `Failed to delete todo "${id}". It may not exist.`,
      },
    ]
  }
)

// =============================================================================
// MCP Prompts - for AI-assisted interactions
// =============================================================================

/**
 * MCP Prompt: Plan the day based on pending todos
 */
export const planDayPrompt = pikkuMCPPromptFunc({
  input: UserIdInputSchema,
  func: async (_services, { userId }, { rpc }) => {
    const result = await rpc.invoke('listTodos', {
      userId,
      completed: false,
    } as any)

    if (result.total === 0) {
      return [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: 'I have no pending todos. Suggest some productive activities for today.',
          },
        },
      ]
    }

    const todoList = result.todos.map(formatTodo).join('\n')

    // Find overdue items
    const now = new Date()
    const overdue = result.todos.filter(
      (t) => t.dueDate && new Date(t.dueDate) < now
    )
    const overdueSection =
      overdue.length > 0
        ? `\n\nOVERDUE (${overdue.length}):\n${overdue.map((t) => `- ${t.title} (was due: ${t.dueDate})`).join('\n')}`
        : ''

    return [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Please help me plan my day. Here are my pending todos:\n\n${todoList}${overdueSection}\n\nSuggest a prioritized schedule for today, considering urgency and importance.`,
        },
      },
    ]
  },
})

/**
 * MCP Prompt: Help prioritize todos
 */
export const prioritizePrompt = pikkuMCPPromptFunc({
  input: PrioritizePromptInputSchema,
  func: async (_services, { userId, focus }, { rpc }) => {
    const result = await rpc.invoke('listTodos', {
      userId,
      completed: false,
    } as any)

    if (result.total === 0) {
      return [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: 'I have no pending todos to prioritize.',
          },
        },
      ]
    }

    const todoList = result.todos
      .map(
        (t) =>
          `- "${t.title}" [priority: ${t.priority}]${t.dueDate ? ` [due: ${t.dueDate}]` : ''} [tags: ${t.tags.join(', ') || 'none'}]`
      )
      .join('\n')

    const focusInstruction =
      focus === 'urgency'
        ? 'Focus on time-sensitive items and deadlines.'
        : focus === 'importance'
          ? 'Focus on high-impact items regardless of deadlines.'
          : focus === 'quick-wins'
            ? 'Focus on items that can be completed quickly to build momentum.'
            : 'Balance urgency and importance using the Eisenhower matrix.'

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Help me prioritize these todos:\n\n${todoList}\n\n${focusInstruction}\n\nProvide a ranked list with reasoning for each position.`,
        },
      },
    ]
  },
})
