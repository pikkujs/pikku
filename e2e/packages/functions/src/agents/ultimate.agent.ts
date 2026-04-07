import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { func } from '#pikku/pikku-types.gen.js'

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
    func('todos:listTodos'),
    func('todos:getTodo'),
    func('todos:addTodo'),
    func('todos:completeTodo'),
    func('todos:deleteTodo'),
    func('emails:sendEmail'),
    func('emails:listEmails'),
    func('graph:sleep'),
    func('graph:math'),
    func('graph:stringTransform'),
    func('graph:typeConvert'),
    func('graph:coalesce'),
    func('graph:dateTime'),
    func('graph:editFields'),
    func('graph:merge'),
    func('graph:omit'),
    func('graph:pick'),
    func('graph:renameKeys'),
    func('graph:aggregate'),
    func('graph:chunk'),
    func('graph:find'),
    func('graph:groupBy'),
    func('graph:limit'),
    func('graph:removeDuplicates'),
    func('graph:reverse'),
    func('graph:sort'),
    func('graph:splitOut'),
    func('graph:summarize'),
    func('graph:unique'),
  ],
  maxSteps: 20,
  toolChoice: 'auto',
})
