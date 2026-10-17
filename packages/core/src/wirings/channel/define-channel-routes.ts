/**
 * Declares a set of message handlers for one `onMessageWiring` key, so they can be defined apart from the channel and keep their types. Returns the routes unchanged.
 *
 * @example snippet: channelRoutes
 */
export function defineChannelRoutes<T extends Record<string, any>>(
  routes: T
): T {
  return routes
}
