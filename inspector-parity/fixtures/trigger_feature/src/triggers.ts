import {
  wireTrigger,
  wireTriggerSource,
  wireTriggerWebhookSource,
  pikkuTriggerFunc,
  pikkuSessionlessFunc,
  ref,
} from '@pikku/core'

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
wireTriggerWebhookSource({
  name: 'git-hub_events',
  route: '/hooks/gh',
  receive: () => {},
  verify: receive,
  credential: 'custom',
})
wireTriggerWebhookSource({ receive })
wireTriggerWebhookSource({
  name: 'hmac-src',
  receive,
  verify: {
    hmac: {
      header: 'X-Hub-Signature-256',
      prefix: 'sha256=',
      algorithm: 'sha256',
      encoding: 'hex',
    },
  },
})
wireTriggerWebhookSource({
  name: 'token-src',
  receive,
  verify: { token: { header: 'X-Gitlab-Token' } },
})
wireTriggerWebhookSource({
  name: 'key-src',
  receive,
  verify: {
    publicKey: { header: 'X-Signature-Ed25519', algorithm: 'ed25519' },
  },
  credential: 'discordPublicKey',
})
wireTriggerWebhookSource({ name: 'fn-src', receive, verify: async () => true })
const signatureHeader = 'x-dynamic-signature'
wireTriggerWebhookSource({
  name: 'dynamic-src',
  receive,
  verify: {
    hmac: { header: signatureHeader, algorithm: 'sha1', encoding: 'base64' },
  },
})
const sharedVerify = { token: { header: 'x-token' } }
wireTriggerWebhookSource({ name: 'shared-src', receive, verify: sharedVerify })
{
  const verify = { hmac: { header: 'x-shorthand-signature' } }
  wireTriggerWebhookSource({ name: 'shorthand-src', receive, verify })
}
{
  const verify = async () => true
  wireTriggerWebhookSource({
    name: 'shorthand-fn-src',
    receive,
    verify,
    credential: 'shorthandSecret',
  })
}
