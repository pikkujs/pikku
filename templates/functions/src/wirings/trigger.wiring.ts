import { wireTrigger, wireTriggerSource } from '../../.pikku/pikku-types.gen.js'
import {
  onTestEvent,
  testEventTrigger,
} from '../functions/trigger.functions.js'

wireTrigger({
  name: 'test-event',
  func: onTestEvent,
})

wireTriggerSource({
  name: 'test-event',
  func: testEventTrigger,
  input: { eventName: 'test-event' },
})
