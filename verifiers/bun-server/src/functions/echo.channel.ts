import { pikkuChannelConnectionFunc } from '#pikku'

export const onConnect = pikkuChannelConnectionFunc<{ connected: boolean }>(
  async (_services, _data, { channel }) => {
    channel.send({ connected: true })
  }
)
