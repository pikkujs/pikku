import { pikkuAgentMiddleware } from '@pikku/core'

export const uppercaseMiddleware = pikkuAgentMiddleware({
  modifyOutputStream: (_services, { event }) => {
    if (event.type === 'text-delta') {
      return { ...event, text: event.text.toUpperCase() }
    }
    return event
  },
  modifyOutput: (_services, { text, messages }) => {
    return { text: text.toUpperCase(), messages }
  },
})
