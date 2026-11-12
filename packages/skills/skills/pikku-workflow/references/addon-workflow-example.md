# A workflow with a table, two addons, a branch and retries, whole

A customer submits feedback over HTTP. It is saved, support is alerted in chat when the rating is low,
and the customer is thanked by email. Written in one pass; `pikku db generate && pikku db migrate`, then
`pikku all && pikku check` are clean. Names are placeholders: keep the shape, change the nouns.

Before this: `pikku addons add sendgrid` and `pikku addons add slack`, then
`pikku meta functions get slack:chatPostMessage sendgrid:mailSend` for the input fields.

```ts
// db/tables.ts
import { defineTables } from '@pikku/kysely'

export const tables = defineTables({
  statements: [
    (db, _types, ctx) =>
      db.schema
        .createTable('feedback')
        .addColumn('feedbackId', ctx.key, (col) => col.primaryKey())
        .addColumn('email', ctx.text, (col) => col.notNull())
        .addColumn('rating', 'integer', (col) => col.notNull())
        .addColumn('comment', ctx.text)
        .addColumn('createdAt', 'timestamp', (col) => col.notNull()),
  ],
  annotations: { feedback: { email: { security: 'pii', format: 'email' }, comment: { security: 'private' } } },
})
```

```ts
// src/definitions/feedback-variables.ts: a config value; `schema` is an exported constant, never inline
import { z } from 'zod'
import { defineVariable } from '#pikku/variables'

export const FeedbackFromEmailSchema = z.string().email()

defineVariable({
  name: 'feedbackFromEmail',
  displayName: 'Feedback sender address',
  description: 'Verified sender address for the feedback thank-you email.',
  variableId: 'FEEDBACK_FROM_EMAIL',
  schema: FeedbackFromEmailSchema,
})
```

```ts
// src/functions/feedback/save-feedback.function.ts: a database write is its own function, sessionless
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const SaveFeedbackInput = z.object({
  email: z.string().email(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
})
export const SaveFeedbackOutput = z.object({ feedbackId: z.string(), email: z.string(), rating: z.number() })

export const saveFeedback = pikkuSessionlessFunc({
  description: 'Stores one piece of customer feedback.',
  input: SaveFeedbackInput,
  output: SaveFeedbackOutput,
  func: async ({ kysely }, data) => {
    const feedbackId = crypto.randomUUID()
    await kysely
      .insertInto('feedback')
      .values({ feedbackId, email: data.email, rating: data.rating, comment: data.comment ?? null, createdAt: new Date().toISOString() })
      .execute()
    return { feedbackId, email: data.email, rating: data.rating }
  },
})
```

```ts
// src/functions/feedback/start-feedback-intake.function.ts: what the HTTP route calls; it only starts the workflow
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { SaveFeedbackInput } from './save-feedback.function.js'

export const startFeedbackIntake = pikkuSessionlessFunc({
  description: 'Starts the feedback intake workflow.',
  input: SaveFeedbackInput,
  output: z.object({ started: z.boolean() }),
  func: async (_services, data, { rpc }) => {
    await rpc.startWorkflow('feedbackIntakeWorkflow', data)
    return { started: true }
  },
})
```

```ts
// src/wirings/feedback.http.ts (mkdir -p src/wirings first)
import { wireHTTP } from '#pikku/http'
import { startFeedbackIntake } from '../functions/feedback/start-feedback-intake.function.js'

wireHTTP({ method: 'post', route: '/feedback', auth: false, func: startFeedbackIntake })
```

```ts
// src/wirings/feedbackintake.workflow.ts: addon functions are steps, `<addon>:<function>`; a branch is a plain if
import { z } from 'zod'
import { pikkuWorkflowFunc } from '#pikku/workflow'
import { SaveFeedbackInput } from '../functions/feedback/save-feedback.function.js'

export const feedbackIntakeWorkflow = pikkuWorkflowFunc({
  input: SaveFeedbackInput,
  output: z.object({ alerted: z.boolean() }),
  func: async ({ variables }, data, { workflow }) => {
    const saved = await workflow.do('Save the feedback', 'saveFeedback', data)

    let alerted = false
    if (saved.rating <= 2) {
      await workflow.do(
        'Alert support',
        'slack:chatPostMessage',
        { token: '', channel: '#support-alerts', text: `Low rating (${saved.rating}) from ${saved.email}` },
        { retries: 2, retryDelay: '10s' }
      )
      alerted = true
    }

    await workflow.do(
      'Thank the customer',
      'sendgrid:mailSend',
      {
        from: { email: variables.get('FEEDBACK_FROM_EMAIL') },
        personalizations: [{ to: [{ email: saved.email }] }],
        subject: 'Thanks for your feedback',
        content: [{ type: 'text/plain', value: 'Thank you for telling us what you think.' }],
      },
      { retries: 3, retryDelay: '30s' }
    )
    return { alerted }
  },
})
```

Things this shape avoids, each of which cost calls before: an addon wrapped in a function of your own that
calls `rpc.invoke` (the step is the call); an inline `defineVariable` schema (PKU111); a `workflow.do` on a
name that no function has (PKU944 on the starter); declaring your own secret for a token the addon holds.
