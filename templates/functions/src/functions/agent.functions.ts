import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { AgentOutputSchema } from '../schemas.js'
import { appendModified, logAgentIO } from '../middleware.js'
import { listTodos, createTodo } from './todos.functions.js'

export const todoAssistant = pikkuAgent({
  name: 'todo-assistant',
  description: 'A helpful assistant that manages todos',
  goal: 'You help users manage their todo lists. Always respond with a message and optionally include the todos array if relevant.',
  model: 'openai/gpt-4o-mini',
  tools: [listTodos, createTodo],
  memory: { storage: 'agentStorage', lastMessages: 10 },
  maxSteps: 5,
  toolChoice: 'auto',
  output: AgentOutputSchema,
  channelMiddleware: [appendModified],
  agentMiddleware: [logAgentIO],
})

export const dailyPlanner = pikkuAgent({
  name: 'daily-planner',
  description: 'Plans your day and suggests tasks based on your schedule',
  goal: 'You help users plan their day. Given a list of todos or context, suggest a prioritized schedule and recommend additional tasks if needed.',
  model: 'openai/gpt-4o-mini',
  maxSteps: 3,
})

export const mainRouter = pikkuAgent({
  name: 'main-router',
  description: 'Routes requests to specialized agents',
  goal: "You coordinate between agents. First fetch the user's todos, then pass them to the daily planner for scheduling advice.",
  model: 'openai/gpt-4o-mini',
  agents: [todoAssistant, dailyPlanner],
  maxSteps: 5,
})
