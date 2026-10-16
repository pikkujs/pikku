import { pikkuFeature } from '@pikku/core/scenario'
import { checkout as renamedCheckout, refund } from './scenarios.js'

export const checkoutFeature = pikkuFeature({
  name: 'Checkout',
  description: 'Paying',
  tags: ['money', 'core'],
  document: false,
  before: async () => {},
  after() {},
  scenarios: [
    renamedCheckout,
    {
      scenario: refund,
      data: {
        amount: -5,
        ok: true,
        nothing: null,
        list: [1, 'two', 0x10],
        nested: { a: 'b' },
      },
    },
    { scenario: refund, data: { computed: refund } },
    { scenario: refund },
    { data: {} },
    ...['a', 'b'].map((name) => ({ scenario: refund, data: { name } })),
  ],
})

export const bare = pikkuFeature({ tags: ['ok', someTag] })

const notExported = pikkuFeature({ name: 'Hidden' })

declare const someTag: string
