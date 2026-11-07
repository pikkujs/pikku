import { pikkuFeature } from '@pikku/core'
import { alpha, beta } from './scenarios.js'

export const checkout = pikkuFeature({
  name: 'Checkout',
  description: 'Buying things',
  tags: ['shop', 'core'],
  document: true,
  before: async () => {},
  scenarios: [alpha, { scenario: beta, data: { n: -0, list: [1, 2.5, 'x', null, true], nested: { 'k': false } } }, { scenario: alpha, data: { x: computed() } }, 'nope'],
})
export const bare = pikkuFeature({ tags: ['x', computed()] })
pikkuFeature({})
function computed(): any { return 1 }
