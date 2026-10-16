import { pikkuSessionlessFunc, pikkuWebhookReceive } from './pikku.js'

export const nightly = pikkuSessionlessFunc<void, void>(async () => {})
export const onPush = pikkuSessionlessFunc<{ ref: string }, void>(
  async () => {}
)
export const sourceFunc = pikkuSessionlessFunc<void, void>(async () => {})
export const chatHandler = pikkuSessionlessFunc<{ text: string }, void>(
  async () => {}
)
export const receive = pikkuWebhookReceive(async () => ({ events: [] }))
export const notAReceiver = pikkuSessionlessFunc<void, void>(async () => {})
