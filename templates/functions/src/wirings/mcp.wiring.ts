import { wireMCPResource, wireMCPPrompt } from '../../.pikku/pikku-types.gen.js'
import {
  getTodoResource,
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
