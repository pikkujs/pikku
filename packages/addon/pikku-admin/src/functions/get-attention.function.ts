import { pikkuFunc } from '#pikku/addon/function'
import { getAttention as readAttention } from '@pikku/core/attention-func'
import type { AttentionResult } from '@pikku/core/attention-func'

export interface AttentionInput {
  projectKey: string
  /** A `<screen>.<slot>` widget id. */
  widget: string
}

export const getAttention = pikkuFunc<AttentionInput, AttentionResult | null>({
  title: 'Get Attention',
  description:
    'Returns the latest stored run of a widget’s attention func for a project, with the time it finished. Nothing is checked at read time; null means it has not run yet.',
  tags: ['admin:attention'],
  expose: true,
  func: async ({ attentionResults }, data) =>
    (await readAttention({ attentionResults }, data)) ?? null,
})
