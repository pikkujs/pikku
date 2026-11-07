import { wireTrigger, wireTriggerSource, wireTriggerWebhookSource, pikkuTriggerFunc, pikkuSessionlessFunc, ref } from '@pikku/core'

const onTick = pikkuTriggerFunc<void>(async () => {})
const receive = pikkuSessionlessFunc<void, void>(async () => {})
const events = { 'order.created': {}, 'order.paid': {} }

wireTrigger({ name: 'billing:order.created', func: onTick, tags: ['a'] })
wireTrigger({ name: 'billing:order.refunded', func: onTick })
wireTrigger({ name: 'noFunc' })
wireTriggerSource({ name: 'ticker', func: onTick })
wireTriggerSource({ name: 'broken' })
wireTriggerWebhookSource({
  name: 'billing',
  method: ['post', 'put'],
  events,
  receive,
  verify: receive,
  credentialDescription: 'signing secret',
  setup: ref('stripe:setup'),
})
wireTriggerWebhookSource({ name: 'git-hub_events', route: '/hooks/gh', receive: () => {}, verify: receive, credential: 'custom' })
wireTriggerWebhookSource({ receive })
