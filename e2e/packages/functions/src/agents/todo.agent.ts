import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/pikku-types.gen.js'
import { uppercaseMiddleware } from '../agent-middleware/uppercase.agent-middleware.js'

export const todoAgent = pikkuAgent({
  name: 'todo-agent',
  description: 'Manages a todo list',
  goal: 'You help users manage their todos. You can list all todos, get details of a specific todo, add new todos, and delete todos.',
  model: 'openai/gpt-5-mini',
  tools: [
    ref('todos:listTodos'),
    ref('todos:getTodo'),
    ref('todos:addTodo'),
    ref('todos:completeTodo'),
    ref('todos:deleteTodo'),
    ref('graph:sleep'),
  ],
  agentMiddleware: [uppercaseMiddleware],
  maxSteps: 10,
  toolChoice: 'auto',
})
