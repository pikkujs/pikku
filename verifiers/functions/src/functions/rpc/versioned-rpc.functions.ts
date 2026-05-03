import { pikkuSessionlessFunc } from '#pikku'

export const getDataV1 = pikkuSessionlessFunc<
  { id: string },
  { id: string; version: number }
>({
  version: 1,
  expose: true,
  func: async ({ logger }, data) => {
    logger.info(`getData v1: ${data.id}`)
    return { id: data.id, version: 1 }
  },
})

export const getData = pikkuSessionlessFunc<
  { id: string; format?: string },
  { id: string; version: number }
>({
  expose: true,
  func: async ({ logger }, data) => {
    logger.info(`getData v2: ${data.id}`)
    return { id: data.id, version: 2 }
  },
})
