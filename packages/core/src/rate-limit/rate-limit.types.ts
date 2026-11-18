/** How many external calls a caller may make in a window. */
export type RateLimitConfig = {
  /** Calls admitted per caller in each window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
  /**
   * The request header holding the client address, such as `cf-connecting-ip`
   * or `x-forwarded-for`. There is no default, because a header the client can
   * set is not an address to trust. Without one every caller shares a bucket
   * per route or tool.
   */
  ipHeader?: string
  /**
   * How many proxies you run that each append to `ipHeader` (default 1). The
   * client address is that many entries from the right of a comma-separated
   * list: a proxy adds the address it saw to the end, so everything to its left
   * is whatever the client claimed. A header with one value needs no change.
   */
  trustedProxies?: number
  /**
   * What happens when the store cannot be reached. `refuse` (the default) answers
   * 503; `allow` lets the call through, which turns the limit off while the
   * store is down.
   */
  onStoreError?: 'refuse' | 'allow'
}
