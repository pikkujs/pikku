import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

export const doubleValue = pikkuSessionlessFunc<
  { value: number },
  { result: number }
>({
  func: async (_services, { value }) => ({
    result: value * 2,
  }),
})

export const formatMessage = pikkuSessionlessFunc<
  { greeting: string; name: string },
  { message: string }
>({
  func: async (_services, { greeting, name }) => ({
    message: `${greeting}, ${name}!`,
  }),
})

export const flakyStep = pikkuSessionlessFunc<
  { value: number },
  { result: number; attempt: number }
>({
  func: async (_services, data, { workflowStep }) => {
    const attempt = workflowStep?.attemptCount ?? 0
    if (attempt === 1) {
      throw new Error('Flaky step: first attempt failed')
    }
    return { result: data.value * 3, attempt }
  },
})

export const alwaysFails = pikkuSessionlessFunc<
  { value: number },
  { result: number }
>({
  func: async (_services, _data, { workflowStep }) => {
    throw new Error(`Always fails: attempt ${workflowStep?.attemptCount ?? 0}`)
  },
})

export const categorize = pikkuSessionlessFunc<
  { score: number },
  { category: string; passed: boolean }
>({
  func: async (_services, { score }, { graph }) => {
    const passed = score >= 70
    if (graph) {
      graph.branch(passed ? 'pass' : 'fail')
    }
    return { category: passed ? 'pass' : 'fail', passed }
  },
})

export const sendNotification = pikkuSessionlessFunc<
  { to: string; subject: string; body: string },
  { sent: boolean; messageId: string }
>({
  func: async (_services, _data) => ({
    sent: true,
    messageId: `msg-${Date.now()}`,
  }),
})
