import type { InvocationContext } from '@azure/functions'
import { PikkuRequest } from '@pikku/core'

export class PikkuAZTimerRequest<In = any> extends PikkuRequest<In> {
  constructor(_context: InvocationContext, data: In) {
    super(data)
  }
}
