import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/pikku-types.gen.js'

export const todoReadAgent = pikkuAIAgent({
  name: 'todo-read-agent',
  description: 'Manages a todo list with read-only workflow access',
  instructions:
    'You help users manage their todos. You can list all todos, get details of a specific todo, add new todos, and delete todos.',
  model: 'openai/o4-mini',
  tools: [
    ref('todos:listTodos'),
    ref('todos:getTodo'),
    ref('todos:addTodo'),
    ref('todos:completeTodo'),
    ref('todos:deleteTodo'),
    ref('graph:sleep'),
  ],
  maxSteps: 10,
  toolChoice: 'auto',
})
