import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
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
