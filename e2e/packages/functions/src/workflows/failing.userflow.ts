import { pikkuUserFlow } from '#pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Test fixture: a user flow that always fails. Used to verify that
 * `pikku userflow run` surfaces a failing flow via a non-zero process exit
 * code (so CI can gate on it), not just via stdout.
 */
export const failingUserFlow = pikkuUserFlow<
  { trigger?: boolean },
  { ok: boolean }
>({
  title: 'Always fails (test fixture)',
  tags: ['user-flow', 'test-fixture'],
  func: async () => {
    throw new Error('failingUserFlow always fails (exit-code fixture)')
  },
})
