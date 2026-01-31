import { wireTrigger } from '../../.pikku/pikku-types.gen.js'
import { onTestEvent } from '../functions/trigger.functions.js'

wireTrigger({
  name: 'test-event',
  func: onTestEvent,
})
