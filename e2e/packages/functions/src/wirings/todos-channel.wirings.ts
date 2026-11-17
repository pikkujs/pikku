import { refChannel } from '#pikku/function'
import { wireChannel } from '#pikku/channel/pikku-channel-types.gen.js'

// @snippet start refChannel
wireChannel({
  name: 'todos',
  route: '/todos',
  auth: true,
  onMessageWiring: { type: refChannel('todos:todoChannel') },
})
// @snippet end refChannel
