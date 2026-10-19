import { pikkuTriggerFunc } from '#pikku/trigger'

/**
 * The warehouse's stock feed, held open for as long as the app runs.
 *
 * Sets up once, keeps a subscription, and fires the trigger per message. The
 * returned function is the teardown pikku calls on shutdown — without it the
 * request outlives the process it belongs to.
 */
export const warehouseStockFeed = pikkuTriggerFunc<
  { threshold: number },
  { itemId: string; name: string; stock: number }
>(async ({ logger, variables }, { threshold }, { trigger }) => {
  const feedUrl = await variables.get('WAREHOUSE_FEED_URL')
  if (!feedUrl) {
    logger.error({ event: 'warehouse_feed_unconfigured' })
    return () => {}
  }
  const abort = new AbortController()

  void (async () => {
    const response = await fetch(feedUrl, { signal: abort.signal })
    if (!response.body) {
      logger.error({ event: 'warehouse_feed_no_body', feedUrl })
      return
    }
    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += value
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const movement = JSON.parse(line.slice(5)) as {
          itemId: string
          name: string
          stock: number
        }
        if (movement.stock <= threshold) trigger.invoke(movement)
      }
    }
  })().catch((error) => {
    if (abort.signal.aborted) return
    logger.error({ event: 'warehouse_feed_failed', error })
  })

  return () => abort.abort()
})
