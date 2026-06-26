import { pikkuChannelConnectionFunc } from '#pikku'

export const onConnect = pikkuChannelConnectionFunc(
  async (_services, _data, { channel }) => {
    channel.send({ connected: true })
  }
)
