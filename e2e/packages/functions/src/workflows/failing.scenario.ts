import { pikkuScenario } from '#pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Test fixture: a scenario that always fails. Used to verify that
 * `pikku scenario run` surfaces a failing flow via a non-zero process exit
 * code (so CI can gate on it), not just via stdout.
 */
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
