import { wireTrigger } from '../../.pikku/pikku-types.gen.js'
import { testEventTrigger } from '../functions/trigger.functions.js'

wireTrigger({
  name: 'test-event',
  func: testEventTrigger,
})
