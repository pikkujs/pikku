import { wireChannel } from '#pikku/channel'
import { onConnect } from './echo.channel.js'

wireChannel({
  name: 'echo',
  route: '/ws/echo',
  onConnect,
})
