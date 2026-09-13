import type { Logger } from '@pikku/core/services'

/**
 * Bring a database-backed service up, or say why the dev server is doing
 * without it.
 *
 * `init()` on these services is a check, not a create — the runtime never
 * issues DDL, so a project whose migrations predate the declaration that needs
 * the tables gets a throw. For a service the dev server supplies on the
 * project's behalf that throw would be an ambush: the project never asked for
 * it, and the failure lands on `pikku dev` rather than on the code that changed.
 *
 * So the service is dropped and the reason is printed. The caller decides
 * whether that is survivable — it is only used where absence degrades to what
 * the project already had, never where something would silently do the wrong
 * thing.
 */
export const initOrWarn = async <T extends { init(): Promise<void> }>(
  service: T,
  name: string,
  logger: Logger
): Promise<T | undefined> => {
  try {
    await service.init()
    return service
  } catch (error) {
    logger.warn(
      `Running without '${name}': ${error instanceof Error ? error.message : String(error)}`
    )
    return undefined
  }
}
