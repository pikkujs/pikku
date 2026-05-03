import { pikkuSessionlessFunc } from '#pikku'

export const processItemV1 = pikkuSessionlessFunc<
  { itemId: string },
  { itemId: string; result: string; version: number }
>({
  title: 'Process Item V1',
  override: 'processItem',
  version: 1,
  func: async ({ logger }, data) => {
    logger.info(`Processing item (v1): ${data.itemId}`)
    return { itemId: data.itemId, result: 'processed-v1', version: 1 }
  },
})

export const processItem = pikkuSessionlessFunc<
  { itemId: string },
  { itemId: string; result: string; version: number }
>({
  title: 'Process Item',
  func: async ({ logger }, data) => {
    logger.info(`Processing item (v2): ${data.itemId}`)
    return { itemId: data.itemId, result: 'processed-v2', version: 2 }
  },
})
