import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { func } from '#pikku/pikku-types.gen.js'

export const todoAskAgent = pikkuAIAgent({
  name: 'todo-ask-agent',
  description: 'Manages a todo list with ask-mode workflow access',
  instructions:
    'You help users manage their todos. You can list all todos, get details of a specific todo, add new todos, and delete todos.',
  model: 'openai/o4-mini',
  tools: [
    func('todos:listTodos'),
    func('todos:getTodo'),
    func('todos:addTodo'),
    func('todos:completeTodo'),
    func('todos:deleteTodo'),
    func('graph:sleep'),
  ],
  maxSteps: 10,
  toolChoice: 'auto',
  dynamicWorkflows: 'ask',
})
