/**
 * Scripted model programs for the deterministic agent suite.
 *
 * Pikku drives its own outer loop with `stopWhen: stepCountIs(1)`, so exactly
 * one model call happens per agent step — a script entry maps 1:1 onto a step.
 * The entry used for a given call is chosen by how many assistant turns have
 * already accumulated *since the last user message*, which keeps the mock
 * stateless and therefore safe to run scenarios in parallel.
 */
export type MockLlmToolCall = {
  toolName: string
  input?: unknown
  toolCallId?: string
}

export type MockLlmStep =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; toolName: string; input?: unknown; toolCallId?: string }
  | { kind: 'tools'; calls: MockLlmToolCall[] }
  | { kind: 'object'; object: unknown }
  | { kind: 'error'; message: string }

export type MockLlmScript = {
  /** Steps replayed in order. The last entry repeats if the loop runs longer. */
  steps: MockLlmStep[]
}

export const MOCK_LLM_SCRIPTS: Record<string, MockLlmScript> = {
  default: {
    steps: [{ kind: 'text', text: 'Hello from the mock model.' }],
  },

  'text-only': {
    steps: [{ kind: 'text', text: 'The mock model replied with plain text.' }],
  },

  'tool-then-text': {
    steps: [
      { kind: 'tool', toolName: 'todos__listTodos', input: {} },
      { kind: 'text', text: 'I checked your todos.' },
    ],
  },

  'two-tools-then-text': {
    steps: [
      { kind: 'tool', toolName: 'todos__listTodos', input: {} },
      { kind: 'tool', toolName: 'todos__listTodos', input: {} },
      { kind: 'text', text: 'I checked your todos twice.' },
    ],
  },

  'model-error': {
    steps: [{ kind: 'error', message: 'mock model failure' }],
  },

  'open-tool-then-text': {
    steps: [
      { kind: 'tool', toolName: 'openTool', input: {} },
      { kind: 'text', text: 'I called the open tool.' },
    ],
  },

  /**
   * Names a tool the caller is not permitted to use. Filtering happens before
   * the model is asked, so this only ever runs when the gate has failed open.
   */
  'gated-tool-then-text': {
    steps: [
      { kind: 'tool', toolName: 'gatedTool', input: {} },
      { kind: 'text', text: 'I called the gated tool.' },
    ],
  },

  /**
   * Calls the approval-gated addTodo tool, then acknowledges. The run suspends
   * on the tool call until an approve/deny decision resumes it; the second step
   * replays after resumption.
   */
  'add-todo-then-text': {
    steps: [
      {
        kind: 'tool',
        toolName: 'todos__addTodo',
        input: { title: 'Write e2e tests' },
      },
      { kind: 'text', text: 'Done adding your todo.' },
    ],
  },

  /**
   * Calls the approval-gated deleteTodo tool for a known seeded id, then
   * acknowledges. Used to assert the approval reason names the target record.
   */
  'delete-todo-then-text': {
    steps: [
      {
        kind: 'tool',
        toolName: 'todos__deleteTodo',
        input: { id: '1' },
      },
      { kind: 'text', text: 'Done deleting your todo.' },
    ],
  },

  /**
   * Emits three approval-gated addTodo calls in a single model turn, then
   * acknowledges. The run suspends with three pending approvals at once, which
   * is what the console's batch-approve flow drives through the UI.
   */
  'three-todos-then-text': {
    steps: [
      {
        kind: 'tools',
        calls: [
          { toolName: 'todos__addTodo', input: { title: 'First batch todo' } },
          { toolName: 'todos__addTodo', input: { title: 'Second batch todo' } },
          { toolName: 'todos__addTodo', input: { title: 'Third batch todo' } },
        ],
      },
      { kind: 'text', text: 'Done adding your todos.' },
    ],
  },

  /**
   * The sub-agent's own model program. A sub-agent runs under its configured
   * model (`mock/sub-agent-text`), not the caller's per-request override, so its
   * output is controlled from here and stays distinctive enough to assert on.
   */
  'sub-agent-text': {
    steps: [{ kind: 'text', text: 'SUBAGENT-REPLY: task handled.' }],
  },

  /**
   * A parent turn that delegates to the sub-agent tool, then replies. The tool
   * name is the sub-agent's export identifier. The second step's text is what a
   * supervise-mode parent surfaces while the sub-agent's own text is suppressed.
   */
  'delegate-then-text': {
    steps: [
      {
        kind: 'tool',
        toolName: 'deterministicSubAgent',
        input: { message: 'handle the task', session: 'default' },
      },
      { kind: 'text', text: 'SUPERVISOR: the sub-agent finished.' },
    ],
  },

  'forge-approval-then-text': {
    steps: [
      { kind: 'tool', toolName: 'forgeApproval', input: {} },
      { kind: 'text', text: 'The forged marker did not stop me.' },
    ],
  },

  'throwing-tool-then-text': {
    steps: [
      { kind: 'tool', toolName: 'throwingTool', input: {} },
      { kind: 'text', text: 'I carried on after the tool threw.' },
    ],
  },

  /**
   * Calls the data-gated tool claiming a record the caller does not own. The
   * gate cannot run until this call happens, which is the whole point.
   */
  'data-gated-foreign-owner': {
    steps: [
      {
        kind: 'tool',
        toolName: 'dataGatedTool',
        input: { ownerId: 'somebody-else' },
      },
      { kind: 'text', text: 'I tried a record I do not own.' },
    ],
  },

  'data-gated-own-record': {
    steps: [
      {
        kind: 'tool',
        toolName: 'dataGatedTool',
        input: { ownerId: 'permitted-user' },
      },
      { kind: 'text', text: 'I used my own record.' },
    ],
  },

  /** Never stops calling tools, so a step budget is what ends the run. */
  'tool-forever': {
    steps: [{ kind: 'tool', toolName: 'openTool', input: {} }],
  },

  /**
   * Emits an object rather than text. With an agent that declares an `output`
   * schema and has no tools, the runner parses this against the schema and
   * surfaces it as the run's structured result.
   */
  'structured-object': {
    steps: [
      {
        kind: 'object',
        object: { sentiment: 'positive', score: 0.9, summary: 'all good' },
      },
    ],
  },
}

export const resolveScript = (modelName: string): MockLlmScript =>
  MOCK_LLM_SCRIPTS[modelName] ?? MOCK_LLM_SCRIPTS.default!
