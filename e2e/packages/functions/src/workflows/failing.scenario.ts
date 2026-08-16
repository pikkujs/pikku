import { pikkuScenario } from '#pikku/scenario'

export const failingScenario = pikkuScenario<
  { trigger?: boolean },
  { ok: boolean }
>({
  title: 'Always fails (test fixture)',
  tags: ['scenario', 'test-fixture'],
  func: async () => {
    throw new Error('failingScenario always fails (exit-code fixture)')
  },
})
