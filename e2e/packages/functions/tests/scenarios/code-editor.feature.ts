import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const ORIGINAL_DESCRIPTION =
  'A function used for e2e testing of the code editor'
const ORIGINAL_BODY = `async (_services, { name }) => {
  return { greeting: \`Hello, \${name}!\` }
}`
const EDITED_BODY = `async (_services, { name }) => {
  return { greeting: \`Hi there, \${name}!\` }
}`
const ORIGINAL_INSTRUCTIONS =
  'You help users manage their todos. You can list all todos, get details of a specific todo, add new todos, and delete todos.'

export const codeEditorScenario = pikkuScenario<void, { edits: number }>({
  title: 'Console code editor (RPC)',
  description:
    'An admin reads and edits a function and an agent through the console RPCs, then restores both',
  tags: ['scenario', 'console', 'code-editor'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'codeEditorScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    const source = await scenario.when(
      'reads editableFunc',
      'readsFunctionSource',
      { functionName: 'editableFunc' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees how editableFunc is declared',
      'expectsValues',
      {
        actual: { ...source.config, wrapperName: source.wrapperName },
        expected: {
          wrapperName: 'pikkuSessionlessFunc',
          title: 'Editable Function',
          expose: true,
        },
      },
      { actor: actors.admin, description: 'sees how editableFunc is declared' }
    )
    await scenario.then(
      'sees the original greeting',
      'expectsText',
      { actual: source.body, contains: 'Hello' },
      { actor: actors.admin, description: 'sees the original greeting' }
    )

    await scenario.when(
      'renames the description',
      'updatesFunctionConfig',
      {
        functionName: 'editableFunc',
        changes: { description: 'Updated by e2e test' },
      },
      { actor: actors.admin }
    )
    const edited = await scenario.when(
      're-reads editableFunc',
      'readsFunctionSource',
      { functionName: 'editableFunc' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the new description',
      'expectsValues',
      {
        actual: edited.config,
        expected: {
          description: 'Updated by e2e test',
          title: 'Editable Function',
        },
      },
      { actor: actors.admin, description: 'sees the new description' }
    )
    await scenario.when(
      'restores the description',
      'updatesFunctionConfig',
      {
        functionName: 'editableFunc',
        changes: { description: ORIGINAL_DESCRIPTION },
      },
      { actor: actors.admin, description: 'restores the description' }
    )

    await scenario.when(
      'rewrites the greeting',
      'updatesFunctionBody',
      { functionName: 'editableFunc', body: EDITED_BODY },
      { actor: actors.admin }
    )
    const rewritten = await scenario.when(
      'reads the rewritten body',
      'readsFunctionBody',
      { functionName: 'editableFunc' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the rewritten greeting',
      'expectsText',
      { actual: rewritten.body, contains: 'Hi there' },
      { actor: actors.admin, description: 'sees the rewritten greeting' }
    )
    await scenario.when(
      'restores the greeting',
      'updatesFunctionBody',
      { functionName: 'editableFunc', body: ORIGINAL_BODY },
      { actor: actors.admin, description: 'restores the greeting' }
    )

    const agent = await scenario.when(
      'reads todoReadAgent',
      'readsAgentSource',
      { agentKey: 'todoReadAgent' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees how todoReadAgent is configured',
      'expectsValues',
      {
        actual: agent.config,
        expected: {
          name: 'todo-read-agent',
          model: 'reasoning',
          maxSteps: 10,
        },
      },
      {
        actor: actors.admin,
        description: 'sees how todoReadAgent is configured',
      }
    )

    await scenario.when(
      'reinstructs the agent',
      'updatesAgentConfig',
      {
        agentKey: 'todoReadAgent',
        changes: { instructions: 'Updated instructions for e2e' },
      },
      { actor: actors.admin }
    )
    const reinstructed = await scenario.when(
      're-reads todoReadAgent',
      'readsAgentSource',
      { agentKey: 'todoReadAgent' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the new instructions',
      'expectsValues',
      {
        actual: reinstructed.config,
        expected: {
          instructions: 'Updated instructions for e2e',
          name: 'todo-read-agent',
        },
      },
      { actor: actors.admin, description: 'sees the new instructions' }
    )
    await scenario.when(
      'restores the instructions',
      'updatesAgentConfig',
      {
        agentKey: 'todoReadAgent',
        changes: { instructions: ORIGINAL_INSTRUCTIONS },
      },
      { actor: actors.admin, description: 'restores the instructions' }
    )

    return { edits: 3 }
  },
})

export const codeEditorConsoleScenario = pikkuScenario<
  void,
  { panels: number }
>({
  title: 'Console code editor (UI)',
  description:
    'An admin opens the console and finds the edit affordance on a local function and a local agent',
  tags: ['scenario', 'console', 'code-editor'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'codeEditorConsoleScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the functions page',
      'opensConsolePage',
      { path: '/console/functions', waitFor: { testId: 'data-table' } },
      { actor: actors.admin, description: 'opens the functions page' }
    )
    await scenario.when(
      'opens editableFunc',
      'clicksRowContaining',
      { text: 'editableFunc' },
      { actor: actors.admin, description: 'opens editableFunc' }
    )
    await scenario.then(
      'sees the function edit button',
      'seesEditButton',
      { title: 'Edit function' },
      { actor: actors.admin, description: 'sees the function edit button' }
    )

    await scenario.given(
      'opens the agents page',
      'opensConsolePage',
      { path: '/console/agents' },
      { actor: actors.admin, description: 'opens the agents page' }
    )
    await scenario.when(
      'opens todoReadAgent',
      'clicksAgentCard',
      { agentKey: 'todoReadAgent' },
      { actor: actors.admin, description: 'opens todoReadAgent' }
    )
    await scenario.then(
      'sees the agent edit button',
      'seesEditButton',
      { title: 'Edit agent' },
      { actor: actors.admin, description: 'sees the agent edit button' }
    )

    return { panels: 2 }
  },
})

export const codeEditorFeature = pikkuFeature({
  name: 'Code Editor',
  description: 'Reading and editing source through the console',
  tags: ['code-editor'],
  scenarios: [codeEditorScenario, codeEditorConsoleScenario],
})
