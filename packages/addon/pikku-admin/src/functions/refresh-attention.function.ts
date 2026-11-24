import { pikkuFunc } from '#pikku/addon/function'
import { refreshAttention as refresh } from '@pikku/core/attention-func'
import type { AttentionResult } from '@pikku/core/attention-func'
import type { AttentionInput } from './get-attention.function.js'

export const refreshAttention = pikkuFunc<
  AttentionInput,
  AttentionResult | null
>({
  title: 'Refresh Attention',
  description:
    'Runs a widget’s attention func for a project now, as a workflow whose get step is retried, and returns what it stored. The project is then kept fresh on the func’s schedule.',
  tags: ['admin:attention'],
  expose: true,
  func: async (
    { attentionResults, workflowService },
    data,
    { rpc, pikkuUserId }
  ) =>
    (await refresh(
      { attentionResults, workflowService },
      { rpc, pikkuUserId },
      data
    )) ?? null,
})
