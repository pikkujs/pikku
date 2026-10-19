import { wireHTTP } from '#pikku/http'
import { listPublished } from '../../functions/list-published.function.js'
import { getPost } from '../../functions/get-post.function.js'
import { listDrafts } from '../../functions/list-drafts.function.js'
import { publishPost } from '../../functions/publish-post.function.js'
import { publishScheduled } from '../../functions/publish-scheduled.function.js'
import { startPublish } from '../content.workflow.js'

/**
 * Two surfaces on one table, and the difference is declared here.
 *
 * `auth: false` appears exactly once, on the index. That is the whole public
 * surface of this application, and keeping it to a single line is deliberate —
 * anonymous reachability should be something a reviewer can count, not
 * something spread across a dozen route files.
 */
// @snippet start wireHttp
wireHTTP({
  method: 'get',
  route: '/posts',
  func: listPublished,
  // Public on purpose. The safety is in the function: sessionless, readonly,
  // and filtered to published-and-past-its-date in the query rather than by
  // anything the caller sends.
  auth: false,
})

wireHTTP({
  method: 'get',
  route: '/posts/:slug',
  func: getPost,
})

wireHTTP({
  method: 'get',
  route: '/editorial/posts',
  func: listDrafts,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/editorial/posts/:postId/publish',
  func: publishPost,
  auth: true,
})
// @snippet end wireHttp

/**
 * The operations surface.
 *
 * `publishScheduled` runs on a cron and `publishWorkflow` ran from nowhere, so
 * an editor waiting on a scheduled post could only wait — there was no "do it
 * now". Both are the same actions the schedule performs, exposed so a person
 * can perform them too, which is what makes them observable when they misbehave.
 */
wireHTTP({
  method: 'post',
  route: '/editorial/publish-due',
  func: publishScheduled,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/editorial/posts/:postId/publish-workflow',
  func: startPublish,
  auth: true,
})
