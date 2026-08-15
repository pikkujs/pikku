import { pikkuScenario } from '#pikku/scenarios/pikku-scenario-types.gen.js'

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
