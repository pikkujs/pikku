import { wireGateway } from '@pikku/core/gateway'
import { chatHandler } from './functions.js'
import { pikkuSessionlessFunc } from './pikku.js'

wireGateway({
  name: 'whatsapp',
  type: 'webhook',
  route: '/gateways/whatsapp',
  platform: 'whatsapp',
  func: chatHandler,
  auth: false,
  tags: ['chat'],
})

wireGateway({
  name: 'chat-ws',
  type: 'websocket',
  func: pikkuSessionlessFunc<{ text: string }, void>(async () => {}),
  description: 'Live chat',
})

wireGateway({
  name: 'listener',
  type: 'listener',
  func: chatHandler,
  auth: 'yes',
})
wireGateway({
  name: 'off',
  type: 'webhook',
  route: '/off',
  func: chatHandler,
  disabled: true,
})
wireGateway({ name: 'nofunc', type: 'webhook' })
wireGateway({ name: 'notype', func: chatHandler })
