import {
  useAnalytics,
  useFlag,
} from '../.pikku/sdk/api/exposed/pikku-product.gen.js'

export const screen = () => {
  const analytics = useAnalytics()
  analytics.event('page_viewed', { path: '/' })
  // @ts-expect-error not a declared event
  analytics.event('page_viewd', { path: '/' })
  // @ts-expect-error payload does not match the declared event
  analytics.event('checkout_completed', { amount: 'ten' })

  useFlag('sandboxes')
  // @ts-expect-error not a declared flag
  useFlag('sandboxez')
}
