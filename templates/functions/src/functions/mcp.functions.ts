import {
  pikkuMCPPromptFunc,
  pikkuMCPResourceFunc,
  pikkuMCPToolFunc,
} from '../../.pikku/pikku-types.gen.js'
import {
  UserIdInputSchema,
  PrioritizePromptInputSchema,
  CreateTodoWithUserInputSchema,
  type Todo,
} from '../schemas.js'

const formatTodo = (todo: Todo): string => {
  const status = todo.completed ? '[x]' : '[ ]'
  const priority = `[${todo.priority.toUpperCase()}]`
  const due = todo.dueDate ? ` (due: ${todo.dueDate})` : ''
  const tags = todo.tags.length > 0 ? ` #${todo.tags.join(' #')}` : ''
  return `${status} ${priority} ${todo.id}: ${todo.title}${due}${tags}`
}

/**
 * MCP Tool: Create a new todo item.
 */
export const createTodoTool = pikkuMCPToolFunc({
  input: CreateTodoWithUserInputSchema,
  func: async (_services, input, { rpc }) => {
    const result = await rpc.invoke('createTodo', input)
    return [
      {
        type: 'text' as const,
        text: `Created todo: "${result.todo.title}" (ID: ${result.todo.id})`,
      },
    ]
  },
})

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

export const planDayPrompt = pikkuMCPPromptFunc({
  input: UserIdInputSchema,
  func: async (_services, { userId }, { rpc }) => {
    const result = await rpc.invoke('listTodos', {
      userId,
      completed: false,
    })

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

export const prioritizePrompt = pikkuMCPPromptFunc({
  input: PrioritizePromptInputSchema,
  func: async (_services, { userId, focus }, { rpc }) => {
    const result = await rpc.invoke('listTodos', {
      userId,
      completed: false,
    })

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
