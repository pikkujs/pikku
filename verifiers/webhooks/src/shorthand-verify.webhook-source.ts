import { wireTriggerWebhookSource } from '#pikku/trigger/pikku-trigger-types.gen.js'
import { parseJson } from '#pikku/utils'

const verify = async () => true

wireTriggerWebhookSource({
  name: 'relay',
  verify,
  receive: {
    func: async (_services, request) => {
      const body = parseJson(request.body)
      return { events: [{ name: body.type, id: body.id, data: body.data }] }
    },
  },
})
