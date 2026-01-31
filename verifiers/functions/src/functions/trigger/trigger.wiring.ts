import { wireTrigger } from '#pikku'
import { testEventTrigger } from './trigger.functions.js'

wireTrigger({
  name: 'test-event',
  func: testEventTrigger,
})
