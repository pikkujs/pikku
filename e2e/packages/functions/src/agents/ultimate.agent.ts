import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/pikku-types.gen.js'

export const ultimateAgent = pikkuAIAgent({
  name: 'ultimate-agent',
  description:
    'Workflow architect — has access to all tools and is responsible for creating and executing workflows',
  instructions:
    'You are a workflow architect. Your primary job is to create, save, and execute workflows that chain tools together. ' +
    'You have access to todo management, email, and a rich set of graph utility tools (sleep, math, string transforms, array operations, data manipulation). ' +
    'When asked to create a workflow, design it with clear node names and proper data wiring between steps. ' +
    'Always explain the workflow structure before saving it.',
  model: 'openai/o4-mini',
  tools: [
    ref('todos:listTodos'),
    ref('todos:getTodo'),
    ref('todos:addTodo'),
    ref('todos:completeTodo'),
    ref('todos:deleteTodo'),
    ref('emails:sendEmail'),
    ref('emails:listEmails'),
    ref('graph:sleep'),
    ref('graph:math'),
    ref('graph:stringTransform'),
    ref('graph:typeConvert'),
    ref('graph:coalesce'),
    ref('graph:dateTime'),
    ref('graph:editFields'),
    ref('graph:merge'),
    ref('graph:omit'),
    ref('graph:pick'),
    ref('graph:renameKeys'),
    ref('graph:aggregate'),
    ref('graph:chunk'),
    ref('graph:find'),
    ref('graph:groupBy'),
    ref('graph:limit'),
    ref('graph:removeDuplicates'),
    ref('graph:reverse'),
    ref('graph:sort'),
    ref('graph:splitOut'),
    ref('graph:summarize'),
    ref('graph:unique'),
  ],
  maxSteps: 20,
  toolChoice: 'auto',
})
