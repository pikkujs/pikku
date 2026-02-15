import { pikkuAIAgent } from '../../.pikku/agent/pikku-agent-types.gen.js'
import { ollama } from '@pikku/ai-vercel'
import { AgentOutputSchema } from '../schemas.js'

export const todoAssistant = pikkuAIAgent({
  name: 'todo-assistant',
  description: 'A helpful assistant that manages todos',
  instructions:
    'You help users manage their todo lists. Always respond with a message and optionally include the todos array if relevant.',
  model: ollama({ model: 'qwen2.5:7b' }),
  tools: ['listTodos', 'createTodo'],
  memory: { storage: 'aiStorage', lastMessages: 10 },
  maxSteps: 5,
  toolChoice: 'auto',
  output: AgentOutputSchema,
})
