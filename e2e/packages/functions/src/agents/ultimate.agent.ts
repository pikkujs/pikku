import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { addon } from '#pikku/pikku-types.gen.js'

export const ultimateAgent = pikkuAIAgent({
  name: 'ultimate-agent',
  description:
    'Workflow architect — has access to all tools and is responsible for creating and executing workflows',
  instructions:
    'You are a workflow architect. Your primary job is to create, save, and execute workflows that chain tools together. ' +
    'You have access to todo management, email, and a rich set of graph utility tools (sleep, math, string transforms, array operations, data manipulation). ' +
    'When asked to create a workflow, design it with clear node names and proper data wiring between steps. ' +
    'Always explain the workflow structure before saving it.',
  model: 'openai/gpt-4o',
  tools: [
    addon('todos:listTodos'),
    addon('todos:getTodo'),
    addon('todos:addTodo'),
    addon('todos:completeTodo'),
    addon('todos:deleteTodo'),
    addon('emails:sendEmail'),
    addon('emails:listEmails'),
    addon('graph:sleep'),
    addon('graph:math'),
    addon('graph:stringTransform'),
    addon('graph:typeConvert'),
    addon('graph:coalesce'),
    addon('graph:dateTime'),
    addon('graph:editFields'),
    addon('graph:merge'),
    addon('graph:omit'),
    addon('graph:pick'),
    addon('graph:renameKeys'),
    addon('graph:aggregate'),
    addon('graph:chunk'),
    addon('graph:find'),
    addon('graph:groupBy'),
    addon('graph:limit'),
    addon('graph:removeDuplicates'),
    addon('graph:reverse'),
    addon('graph:sort'),
    addon('graph:splitOut'),
    addon('graph:summarize'),
    addon('graph:unique'),
  ],
  maxSteps: 20,
  toolChoice: 'auto',
  dynamicWorkflows: 'always',
})
