//~ name: workflow
//~ title: Durable multi-step workflow (pikkuWorkflowFunc DSL + parallel fan-out + cron start)
//~ when: The app needs a background multi-step process — daily digest, onboarding sequence, status rollup. This IS the canonical shape. The DSL supports if/else, for..of, and Promise.all(array.map()) — fan out per item with workflow.do named steps (parallel + durable). NEVER pikkuWorkflowComplexFunc / pikkuWorkflowGraph (approval-gated escape hatches). PKU641 = a const/let DECLARED inside a block — hoist the declaration to the top of the body and assign in the block.
//~ entity: digest
//~ Four files, and the SPLIT is the teaching. A wire* sharing a file with the workflow
//~ func makes pikku SKIP the task at runtime ("Skipping scheduled task — metadata not
//~ found") and the cron silently never fires; a *.workflow.ts holding several
//~ pikkuSessionlessFunc exports bloats codegen until it times out ("codegen exited
//~ null"). Both used to be warnings the agent had to honour by hand. Now the layout
//~ arrives correct and the warnings are gone.

// ===== FILE: packages/functions/src/functions/list-digest-recipients.function.ts =====
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

//~ STEP FUNCS are normal pikku funcs the workflow calls BY NAME via workflow.do.
//~ input/output are ALWAYS named consts (even an empty {}) — never inline at the
//~ input:/output: site; pikku rejects inline expressions with PKU489.
//~ A step that needs NO auth is a pikkuSessionlessFunc; if it gates, permissions values
//~ are pikkuAuth/pikkuPermission OBJECTS, never strings (`permissions: ['authenticated']`
//~ → `Type 'string' not assignable to PikkuPermission`). Plain "signed in" = `auth: true`.
export const ListDigestRecipientsInput = z.object({})
export const ListDigestRecipientsOutput = z.object({
  recipients: z.array(z.object({ id: z.string(), email: z.string(), name: z.string().nullable() })),
})

export const listDigestRecipients = pikkuSessionlessFunc({
  expose: true, //~ steps must be registered RPCs so workflow.do can dispatch them
  readonly: true,
  description: 'All users who should receive the daily digest.',
  input: ListDigestRecipientsInput,
  output: ListDigestRecipientsOutput,
  func: async ({ kysely }) => {
    const rows = await kysely.selectFrom('user').select(['id', 'email', 'name']).execute()
    return { recipients: rows.map((r) => ({ id: r.id, email: r.email, name: r.name ?? null })) }
  },
})

// ===== FILE: packages/functions/src/functions/send-digest-email.function.ts =====
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

//~ ONE recipient per step — the workflow fans these out in PARALLEL, so each send is
//~ its own durable, retryable step in the graph view.
export const SendDigestEmailInput = z.object({
  email: z.string(),
  name: z.string().nullable(),
})
export const SendDigestEmailOutput = z.object({ ok: z.boolean() })

export const sendDigestEmail = pikkuSessionlessFunc({
  expose: true,
  description: 'Send the digest email to one recipient.',
  input: SendDigestEmailInput,
  output: SendDigestEmailOutput,
  func: async ({ emailService }, input) => {
    //~ 'dailyDigest' must exist as emails/templates/daily-digest.html + locale keys
    //~ (see {name: transactional-email} and the pikku-emails skill).
    await emailService.send({
      to: input.email,
      template: { name: 'dailyDigest', data: { firstName: input.name ?? 'there' } },
    })
    return { ok: true }
  },
})

// ===== FILE: packages/functions/src/workflows/daily-digest.workflow.ts =====
import { z } from 'zod'
import { pikkuWorkflowFunc } from '#pikku/workflow'

//~ Plain pikkuWorkflowFunc DSL. Control flow allowed in the body: if/else, for..of, and
//~ Promise.all(array.map()). Declare every const/let at the TOP level of the body
//~ (PKU641 fires on declarations inside blocks).
export const DailyDigestWorkflowInput = z.object({})
export const DailyDigestWorkflowOutput = z.object({ sent: z.number() })

export const dailyDigestWorkflow = pikkuWorkflowFunc({
  description: 'Collect recipients and send the daily digest to each in parallel.',
  input: DailyDigestWorkflowInput,
  output: DailyDigestWorkflowOutput,
  func: async (_services, _data, { workflow }) => {
    const audience = await workflow.do('Collect recipients', 'listDigestRecipients', {})

    //~ PARALLEL FAN-OUT — one named durable step per recipient, all at once.
    await Promise.all(
      audience.recipients.map(
        async (r) =>
          await workflow.do(`Send digest to ${r.email}`, 'sendDigestEmail', {
            email: r.email,
            name: r.name,
          }),
      ),
    )

    return { sent: audience.recipients.length }
  },
})

// ===== FILE: packages/functions/src/wires/cron/daily-digest.scheduler.ts =====
import { pikkuVoidFunc } from '#pikku/function'
import { wireScheduler } from '#pikku/scheduler'

//~ CRON START — a tiny scheduled func starts the workflow; wireScheduler wires it.
//~ Scheduled funcs MUST use pikkuVoidFunc (void→void, no input/output schemas) —
//~ pikkuSessionlessFunc does NOT typecheck against wireScheduler. Schedule is
//~ 5-field cron (07:00 UTC daily).
export const startDailyDigest = pikkuVoidFunc({
  title: 'Start daily digest',
  func: async (_services, _input, { rpc }) => {
    await rpc.startWorkflow('dailyDigestWorkflow', {})
  },
})

wireScheduler({
  name: 'startDailyDigest',
  schedule: '0 7 * * *',
  func: startDailyDigest,
})
