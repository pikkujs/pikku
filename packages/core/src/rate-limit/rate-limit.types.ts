/** How many external calls a caller may make in a window. */
export type RateLimitConfig = {
  /** Calls admitted per caller in each window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
  /**
   * The request header holding the client address, such as `cf-connecting-ip`
   * or `x-forwarded-for` (its first entry is used). There is no default,
   * because a header the client can set is not an address to trust. Without
   * one every caller shares a bucket per route or tool.
   */
  ipHeader?: string
  /**
   * What happens when the store cannot be reached. `refuse` (the default) answers
   * 503; `allow` lets the call through, which turns the limit off while the
   * store is down.
   */
  onStoreError?: 'refuse' | 'allow'
}
