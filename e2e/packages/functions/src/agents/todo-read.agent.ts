import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { addon } from '#pikku/pikku-types.gen.js'

export const todoReadAgent = pikkuAIAgent({
  name: 'todo-read-agent',
  description: 'Manages a todo list with read-only workflow access',
  instructions:
    'You help users manage their todos. You can list all todos, get details of a specific todo, add new todos, and delete todos.',
  model: 'openai/gpt-4o',
  tools: [
    addon('todos:listTodos'),
    addon('todos:getTodo'),
    addon('todos:addTodo'),
    addon('todos:completeTodo'),
    addon('todos:deleteTodo'),
    addon('graph:sleep'),
  ],
  maxSteps: 10,
  toolChoice: 'auto',
  dynamicWorkflows: 'read',
})
