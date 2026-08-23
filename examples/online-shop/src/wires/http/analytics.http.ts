import { wireHTTP } from '#pikku/http'
import { recordAnalyticsEvents } from '../../functions/record-analytics-events.function.js'
import { analyticsOriginMiddleware } from '../../middleware/analytics-origin.middleware.js'

/**
 * The analytics beacon endpoint. Unauthed on purpose — anonymous visitors are
 * most of what this measures — and guarded by `analyticsOriginMiddleware`,
 * which rejects anything that is not a browser on this app's own origin (403).
 *
 * That is an origin lock, not a flood control: `Origin` is set by the browser
 * and trusted by nobody else, so it stops another site's page beaconing in here
 * but not a determined client. Rate limiting is deliberately absent — it is a
 * platform concern rather than one route's, and is not built yet. Until it is,
 * treat volume through here as unbounded.
 */
wireHTTP({
  method: 'post',
  route: '/analytics',
  func: recordAnalyticsEvents,
  auth: false,
  middleware: [analyticsOriginMiddleware],
})
