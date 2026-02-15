import { pikkuAIAgent } from '../../.pikku/agent/pikku-agent-types.gen.js'
import { AgentOutputSchema } from '../schemas.js'
import { appendModified } from '../middleware.js'

export const todoAssistant = pikkuAIAgent({
  name: 'todo-assistant',
  description: 'A helpful assistant that manages todos',
  instructions:
    'You help users manage their todo lists. Always respond with a message and optionally include the todos array if relevant.',
  model: 'ollama/qwen2.5:7b',
  tools: ['listTodos', 'createTodo'],
  memory: { storage: 'aiStorage', lastMessages: 10 },
  maxSteps: 5,
  toolChoice: 'auto',
  output: AgentOutputSchema,
  channelMiddleware: [appendModified],
})

export const dailyPlanner = pikkuAIAgent({
  name: 'daily-planner',
  description: 'Plans your day and suggests tasks based on your schedule',
  instructions:
    'You help users plan their day. Given a list of todos or context, suggest a prioritized schedule and recommend additional tasks if needed.',
  model: 'ollama/qwen2.5:7b',
  maxSteps: 3,
})

export const mainRouter = pikkuAIAgent({
  name: 'main-router',
  description: 'Routes requests to specialized agents',
  instructions:
    "You coordinate between agents. First fetch the user's todos, then pass them to the daily planner for scheduling advice.",
  model: 'ollama/qwen2.5:7b',
  agents: ['todo-assistant', 'daily-planner'],
  maxSteps: 5,
})
