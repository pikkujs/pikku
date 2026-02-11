import { wireTrigger, wireTriggerSource } from '#pikku'
import { triggerTargetHandler } from './trigger-target.functions.js'
import { testEventTrigger } from './trigger.functions.js'

wireTrigger({
  name: 'test-event',
  func: triggerTargetHandler,
})

wireTriggerSource({
  name: 'test-event',
  func: testEventTrigger,
  input: { eventName: 'test-event' },
})
