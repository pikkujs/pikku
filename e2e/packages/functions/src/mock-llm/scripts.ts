/**
 * Scripted model programs for the deterministic agent suite.
 *
 * Pikku drives its own outer loop with `stopWhen: stepCountIs(1)`, so exactly
 * one model call happens per agent step — a script entry maps 1:1 onto a step.
 * The entry used for a given call is chosen by how many assistant turns have
 * already accumulated *since the last user message*, which keeps the mock
 * stateless and therefore safe to run scenarios in parallel.
 */
export type MockLlmStep =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; toolName: string; input?: unknown; toolCallId?: string }
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
}

export const resolveScript = (modelName: string): MockLlmScript =>
  MOCK_LLM_SCRIPTS[modelName] ?? MOCK_LLM_SCRIPTS.default!
