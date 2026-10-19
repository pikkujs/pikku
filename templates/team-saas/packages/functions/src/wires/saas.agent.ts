import { pikkuAgent, agent } from '#pikku/agent'
import { wireHTTP } from '#pikku/http'
import { listIssues } from '../functions/list-issues.function.js'
import { listMyOrgs } from '../functions/list-my-orgs.function.js'
import { closeIssue } from '../functions/close-issue.function.js'

/**
 * Its tools carry the tenancy permission with them, which is the point: an
 * agent asking about "my issues" is scoped by the same membership check as the
 * person it is acting for, and cannot be talked into reading another tenant.
 */
export const workspaceAssistant = pikkuAgent({
  name: 'workspace-assistant',
  description: 'Answers questions about a workspace’s backlog.',
  goal: 'Help a member find and close the issues in organisations they belong to.',
  model: 'openai/gpt-4o-mini',
  tools: [listMyOrgs, listIssues, closeIssue],
  memory: { storage: 'aiStorage', lastMessages: 20 },
  maxSteps: 10,
})

wireHTTP({
  method: 'post',
  route: '/agents/workspace',
  func: agent('workspaceAssistant'),
  auth: true,
})
