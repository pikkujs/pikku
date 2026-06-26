import { wireChannel } from '#pikku'
import { onConnect } from './echo.channel.js'

wireChannel({
  name: 'echo',
  route: '/ws/echo',
  onConnect,
})
