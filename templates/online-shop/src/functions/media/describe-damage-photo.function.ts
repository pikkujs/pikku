import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { NotFoundError } from '#pikku/error'
import { BUCKET } from '../../lib/file-keys.js'
import { isOrderOwner } from '../../wirings/shop.security.js'

export const DescribeDamagePhotoInput = z.object({ orderId: z.string() })
export const DescribeDamagePhotoOutput = z.object({ description: z.string() })

// @snippet start contentAgentAttachment
export const describeDamagePhoto = pikkuFunc({
  expose: true,
  description:
    'Ask the assistant what is wrong with the item in a damage photo.',
  input: DescribeDamagePhotoInput,
  output: DescribeDamagePhotoOutput,
  permissions: { owner: isOrderOwner },
  func: async ({ kysely, content }, { orderId }, { rpc, session }) => {
    const order = await kysely
      .selectFrom('order')
      .select(['damagePhotoKey', 'damagePhotoType'])
      .where('orderId', '=', orderId)
      .executeTakeFirst()
    if (!order?.damagePhotoKey || !order.damagePhotoType) {
      throw new NotFoundError()
    }

    const photo = await content.readFileAsBuffer({
      bucket: BUCKET,
      key: order.damagePhotoKey,
    })
    const { result } = await rpc.agent.run('shopAssistant', {
      message: 'What damage does this photo show?',
      threadId: `damage-${orderId}`,
      resourceId: session.userId,
      attachments: [
        {
          type: 'image',
          data: photo.toString('base64'),
          mediaType: order.damagePhotoType,
        },
      ],
    })
    return { description: result }
  },
})
// @snippet end contentAgentAttachment
