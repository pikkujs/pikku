import {
  wireTrigger,
  wireTriggerSource,
  wireTriggerWebhookSource,
} from '@pikku/core/trigger'
import { onPush, sourceFunc, receive, notAReceiver } from './functions.js'
import { pikkuSessionlessFunc, ref } from './pikku.js'

type GithubEvents = { push: { ref: string }; release: { tag: string } }

wireTrigger({ name: 'github:push', func: onPush, tags: ['github'] })
wireTrigger({ name: 'github:deleted', func: onPush })
wireTrigger({
  name: 'plain',
  func: pikkuSessionlessFunc<void, void>(async () => {}),
})
wireTrigger({ name: 'off', func: onPush, disabled: true })
// @ts-expect-error no func
wireTrigger({ name: 'nofunc' })

wireTriggerSource({ name: 'poller', func: sourceFunc })
wireTriggerSource({ name: 'inline-source', func: async () => {} })

wireTriggerWebhookSource({
  name: 'github',
  events: {} as GithubEvents,
  receive,
  check: pikkuSessionlessFunc<void, void>(async () => {}),
  setup: ref('shop:charge'),
  teardown: ref('missing:fn'),
  verify: async () => true,
  credentialDescription: 'GitHub signing secret',
})

wireTriggerWebhookSource({
  name: 'my-hook_source',
  method: ['post', 'put'],
  route: '/hooks/custom',
  receive: notAReceiver,
  verify: async () => true,
  credential: 'customSecret',
})

wireTriggerWebhookSource({ name: 'no-verify', method: 'get', receive })

wireTriggerWebhookSource({ receive })
