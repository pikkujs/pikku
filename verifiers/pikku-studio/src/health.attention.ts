import { pikkuAttentionFunc } from '../.pikku/addon/attention/index.js'

// @snippet start attentionFunc
export const healthAttention = pikkuAttentionFunc({
  widget: 'health.verdict',
  every: '1m',
  func: async (_services, { projectKey }) => {
    if (projectKey === 'quiet') return undefined
    return { score: 0.6, reason: 'Three requests are waiting', impact: 3 }
  },
})
// @snippet end attentionFunc
