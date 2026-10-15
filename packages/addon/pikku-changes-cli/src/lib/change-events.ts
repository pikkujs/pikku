/**
 * A project's change-queue events, as a wake-up signal for `changes next`.
 *
 * the backend publishes on `changes:<projectId>` when an item is filed and when a
 * person answers on its thread. An event is only a hint — the caller re-reads
 * `listChanges` for the truth — so nothing here parses or trusts its payload.
 */
export interface ChangeEvents {
  /** True while the stream is connected; polling slows to a safety net. */
  readonly live: boolean
  /**
   * Resolves on the next event, and also when the stream connects or drops,
   * so a caller sleeping on the slow safety interval notices it has lost its
   * signal. An event that arrived while nobody was waiting, such as during a
   * re-read, resolves the next call at once. Never rejects.
   */
  next(): Promise<void>
  close(): void
}
