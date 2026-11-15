/**
 * Generates the server-side `events.gen.ts` scaffold.
 *
 * It used to wire an open `/events` channel and a `GET /events/:topic` stream
 * that subscribed any caller to any topic. A stream now subscribes only through
 * a `pikkuSubscribeFunc`, which runs the caller's session, scopes and
 * permissions and returns the one topic they may follow, so nothing here can
 * safely wire that for you. The file is kept, empty of wiring, so a project's
 * config and imports stay valid while the app wires its own subscribe
 * functions.
 */
export const serializeEventsScaffold = (): string => `/**
 * Auto-generated, and deliberately wiring nothing.
 *
 * A stream subscribes to the event hub only through a pikkuSubscribeFunc that
 * returns the topic the caller may follow. Declare one and wire it yourself:
 *
 *   export const orderEvents = pikkuSubscribeFunc<{ orderId: string }, \`order:\${string}\`>({
 *     permissions: { owner: orderOwner },
 *     func: async (_services, { orderId }) => \`order:\${orderId}\`,
 *   })
 *   wireHTTP({ method: 'get', route: '/orders/:orderId/events', func: orderEvents, sse: true })
 *
 * See the pikku-realtime skill.
 */
export {}
`
