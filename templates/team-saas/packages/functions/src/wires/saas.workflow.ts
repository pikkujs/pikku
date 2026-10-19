import { z } from 'zod'
import { pikkuWorkflowFunc } from '#pikku/workflow'
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'
import { randomUUID } from 'node:crypto'

// @snippet start wireWorkflow
// Each step is an ordinary pikku function, which is what makes it retryable on
// its own and replayable from the durable log.
export const createOrganisation = pikkuSessionlessFunc({
  description: 'Create the organisation row.',
  func: async ({ kysely }, { name, slug, ownerId }: { name: string; slug: string; ownerId: string }) => {
    const orgId = randomUUID()
    await kysely.insertInto('organisation').values({ orgId, name, slug }).execute()
    await kysely
      .insertInto('membership')
      .values({ membershipId: randomUUID(), orgId, userId: ownerId, orgRole: 'owner' })
      .execute()
    return { orgId }
  },
})

export const seedFirstProject = pikkuSessionlessFunc({
  description: 'Give a new organisation something to look at.',
  func: async ({ kysely }, { orgId }: { orgId: string }) => {
    const projectId = randomUUID()
    await kysely
      .insertInto('project')
      .values({ projectId, orgId, name: 'General', key: 'GEN' })
      .execute()
    return { projectId }
  },
})

export const welcomeOwner = pikkuSessionlessFunc({
  description: 'Tell the owner their workspace is ready.',
  func: async ({ logger }, { orgId }: { orgId: string }) => {
    logger.info({ event: 'workspace_ready', orgId })
  },
})

// Onboarding is a workflow rather than one function because the steps fail
// independently and two of them are not safe to repeat. A crash after the
// organisation exists but before the owner is a member would otherwise leave a
// workspace nobody can enter.
export const onboardOrganisation = pikkuWorkflowFunc<
  { name: string; slug: string; ownerId: string },
  { orgId: string; projectId: string }
>({
  // Not exposed: onboarding is started by the signup flow, not called by name
  // over the generic RPC endpoint.
  expose: false,
  func: async (_services, data, { workflow }) => {
    const org = await workflow.do('Create organisation', 'createOrganisation', {
      name: data.name,
      slug: data.slug,
      ownerId: data.ownerId,
    })
    const project = await workflow.do('Seed first project', 'seedFirstProject', {
      orgId: org.orgId,
    })
    await workflow.do('Welcome the owner', 'welcomeOwner', { orgId: org.orgId })
    return { orgId: org.orgId, projectId: project.projectId }
  },
})
// @snippet end wireWorkflow

export const StartOnboardingInput = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
})
export const StartOnboardingOutput = z.object({ runId: z.string() })

/**
 * The workflow's front door.
 *
 * `onboardOrganisation` is marked `expose: false` with a comment saying signup
 * starts it — and nothing did. Three steps (create the organisation, seed its
 * first project, welcome the owner) with no caller of any kind, while the app's
 * own empty state told a member with no workspace to "create one" and offered
 * no way to.
 *
 * The owner is the caller's own session rather than an input: letting a client
 * nominate somebody else as owner of a new organisation is a privilege
 * escalation dressed as a parameter.
 */
export const startOnboarding = pikkuFunc({
  expose: true,
  description: 'Create a workspace for the signed-in user and seed its first project.',
  input: StartOnboardingInput,
  output: StartOnboardingOutput,
  func: async (_services, { name, slug }, { rpc, session }) => {
    const runId = await rpc.startWorkflow('onboardOrganisation', {
      name,
      slug,
      ownerId: session.userId,
    })
    return { runId: String(runId) }
  },
})
