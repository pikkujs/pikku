/**
 * Type-safe helper for defining channel message routes that can be composed.
 * Returns the routes record as-is (identity function) for use with `wireChannel`.
 *
 * @example
 * ```typescript
 * export const chatRoutes = defineChannelRoutes({
 *   greet: pikkuChannelFunc({ func: greetFunc }),
 *   farewell: pikkuChannelFunc({ func: farewellFunc }),
 * })
 *
 * wireChannel({
 *   name: 'chat',
 *   route: '/ws/chat',
 *   onMessageWiring: {
 *     command: chatRoutes,
 *   }
 * })
 * ```
 */
export function defineChannelRoutes<T extends Record<string, any>>(
  routes: T
): T {
  return routes
}
