import { pikkuChannelConnectionFunc } from '#pikku/channel'

export const onConnect = pikkuChannelConnectionFunc(
  async (_services, _data, { channel }) => {
    await channel.send({ connected: true })
  }
)
