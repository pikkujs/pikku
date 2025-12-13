import {
  wireMCPTool,
  wireMCPResource,
  wireMCPPrompt,
} from '../../.pikku/pikku-types.gen.js'
import {
  getTodoResource,
  createTodoTool,
  completeTodoTool,
  deleteTodoTool,
  planDayPrompt,
  prioritizePrompt,
} from '../functions/mcp.functions.js'

wireMCPResource({
  uri: 'todos/{id}',
  title: 'Todo Details',
  description: 'Get details of a specific todo by ID',
  func: getTodoResource,
  tags: ['todos'],
})

wireMCPTool({
  name: 'createTodo',
  description:
    'Create a new todo item with title, description, priority, dueDate, and tags',
  func: createTodoTool,
  tags: ['todos', 'create'],
})

wireMCPTool({
  name: 'completeTodo',
  description: 'Mark a todo as complete by ID',
  func: completeTodoTool,
  tags: ['todos', 'update'],
})

wireMCPTool({
  name: 'deleteTodo',
  description: 'Delete a todo by ID',
  func: deleteTodoTool,
  tags: ['todos', 'delete'],
})

wireMCPPrompt({
  name: 'planDay',
  description: 'Generate a daily plan based on pending todos',
  func: planDayPrompt,
  tags: ['productivity', 'planning'],
})

wireMCPPrompt({
  name: 'prioritize',
  description:
    'Help prioritize todos based on urgency, importance, or quick-wins',
  func: prioritizePrompt,
  tags: ['productivity', 'prioritization'],
})
