import { pikkuSessionlessFunc } from '#pikku/function'
import {
  getLlmCallLog,
  resetLlmCallLog,
  type MockLlmCall,
} from '../mock-llm/provider.js'

export const lastLlmCall = pikkuSessionlessFunc<void, MockLlmCall | null>({
  expose: true,
  func: async () => {
    const log = getLlmCallLog()
    return log[log.length - 1] ?? null
  },
})

export const llmCallLog = pikkuSessionlessFunc<void, MockLlmCall[]>({
  expose: true,
  func: async () => getLlmCallLog(),
})

export const resetLlmLog = pikkuSessionlessFunc<void, { reset: true }>({
  expose: true,
  func: async () => {
    resetLlmCallLog()
    return { reset: true }
  },
})

/**
 * The working memory notepad a thread currently holds.
 *
 * Nothing else exposes it: the console renders the schema rather than the value,
 * and the merged state only ever reaches the model. Reading it back is the only
 * way a scenario can tell what survived a turn, and on the `ai-live` tier it is
 * the only way at all — the model call log is the mock provider's, and there is
 * no mock provider once the runs are real.
 */
export const agentWorkingMemory = pikkuSessionlessFunc<
  { threadId: string },
  Record<string, unknown> | null
>({
  expose: true,
  func: async ({ agentStorage }, { threadId }) => {
    if (!agentStorage) {
      throw new Error('agentStorage is not configured on this deployment')
    }
    return agentStorage.getWorkingMemory(threadId, 'thread')
  },
})
