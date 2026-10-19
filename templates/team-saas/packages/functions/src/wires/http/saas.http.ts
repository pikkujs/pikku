import { wireHTTP } from '#pikku/http'
import { onSeatsExceeded } from '../../functions/on-seats-exceeded.function.js'
import { sendInvitation } from '../../functions/send-invitation.function.js'
import { listIssues } from '../../functions/list-issues.function.js'
import { createIssue } from '../../functions/create-issue.function.js'
import { closeIssue } from '../../functions/close-issue.function.js'
import { listProjects } from '../../functions/list-projects.function.js'
import { startOnboarding } from '../saas.workflow.js'

/**
 * Every route is authenticated. There is no anonymous surface in a
 * multi-tenant product — an unauthenticated read has no organisation to be
 * scoped to, so there is nothing it could correctly return.
 */
// @snippet start wireHttp
wireHTTP({
  method: 'get',
  route: '/orgs/:orgId/issues',
  func: listIssues,
  auth: true,
})

wireHTTP({
  method: 'get',
  route: '/orgs/:orgId/projects',
  func: listProjects,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/orgs/:orgId/issues',
  func: createIssue,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/issues/:issueId/close',
  func: closeIssue,
  auth: true,
})
// @snippet end wireHttp

wireHTTP({
  method: 'post',
  route: '/orgs',
  func: startOnboarding,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/invitations/:invitationId/send',
  func: sendInvitation,
  auth: true,
})

wireHTTP({
  method: 'post',
  route: '/orgs/:orgId/seats-exceeded',
  func: onSeatsExceeded,
  auth: true,
})
