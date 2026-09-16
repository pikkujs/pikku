//~ name: public-facing-rpc
//~ title: Public RPC (no sign-in) — anonymous form / webhook write
//~ entity: contactMessage
//~ when: A function must work WITHOUT a logged-in user — a public page's contact / waitlist / signup / feedback / newsletter form, an inbound webhook, a health check, or ANY endpoint the task calls "public", "without signing in", "unauthenticated", "anonymous", or "anyone can". Reach for THIS instead of update-mutation / list-query whenever the caller is not signed in.
//~ steps:
//~ ═══ CLIENT SIDE — a PUBLIC form on an UNAUTHENTICATED route ═══
//~ The page sits on a public route (no auth guard) and the call needs NO session. Use
//~ usePikkuMutation with isPending/error for the button + INLINE feedback — never a toast,
//~ never hand-managed useState:
//~
//~   const mutation = usePikkuMutation('submitContactMessage', {
//~     onSuccess: () => { /* show inline success + reset the form */ },
//~   })
//~   // <Button loading={mutation.isPending} onClick={() => mutation.mutate({ name, email, message })}>
//~   // {mutation.error && <Text c="red">{asI18n(mutation.error.message)}</Text>}
//~   // {mutation.isSuccess && <Text c="green">{t('contact.sent')}</Text>}
// ===== FILE: packages/functions/src/functions/submit-contact-message.function.ts =====
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
//~ INPUT columns come from the GENERATED DB zod (`#pikku/db/zod.gen.js`) — `<Table>InsertZ`
//~ for a create, `<Table>Z.pick()` for what you return. Re-typing a column by hand drifts.
import { ContactMessageInsertZ, ContactMessageZ } from '#pikku/db/zod.gen.js' //~ swap for YOUR table

//~ ── DECIDE PUBLIC vs SIGNED-IN FIRST — it picks the primitive, and the default is wrong here ──
//~ The DEFAULT primitive, pikkuFunc, REQUIRES a session: an anonymous caller gets a 403
//~ ("Authentication required") and the request never reaches your code. So:
//~   • Called only by a signed-in user (a dashboard action, "my" data)? → pikkuFunc.
//~     A session is required; scope writes by session.userId. See the update-mutation scaffold.
//~   • Called by ANYONE, including logged-out visitors — a public page's form, a webhook,
//~     a health check? → pikkuSessionlessFunc, as below (auth: false). There is NO session,
//~     so you CANNOT scope by session.userId and you MUST validate every field yourself.
//~ This is the #1 public-form bug: a pikkuFunc behind a public form 403s every anonymous
//~ visitor, so the form silently never submits. "Public / without signing in" is a BACKEND
//~ fact — it means pikkuSessionlessFunc, not just an unauthenticated frontend route.

//~ INPUT = the real columns the form sends, picked off the generated Insert zod (so the types
//~ track the DB) and tightened with .extend. NEVER ship an empty/omitted input schema — an
//~ empty z.object({}) rejects every field the form sends with a 422 and the form can't submit.
export const SubmitContactMessageInput = ContactMessageInsertZ.pick({
  name: true,
  email: true,
  message: true,
}).extend({
  name: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(1).max(5000),
})

//~ OUTPUT = only what the client needs back — an id is enough to confirm the write landed.
export const SubmitContactMessageOutput = ContactMessageZ.pick({ id: true })

export const submitContactMessage = pikkuSessionlessFunc({
  expose: true,
  //~ PUBLIC — no session required. If you ALSO add an explicit HTTP wiring, it must be
  //~ auth: false too; a kind⇔auth mismatch (sessionless func wired auth: true) is a hard
  //~ PKU573 error.
  auth: false,
  description: 'Accept a contact-form submission from an anonymous visitor.',
  input: SubmitContactMessageInput,
  output: SubmitContactMessageOutput,
  //~ No `permissions` and no session scoping — the endpoint is intentionally open. A public
  //~ write STILL needs a real table + migration: add db/postgres/<n>-contact-message.sql
  //~ (and db/sqlite/<n>-contact-message.sql for a libSQL stage) creating the table BEFORE
  //~ this ships, or the insert 500s at runtime.
  func: async ({ kysely }, input) => {
    const row = await kysely
      .insertInto('contactMessage')
      .values({ name: input.name, email: input.email, message: input.message })
      .returning(['id'])
      .executeTakeFirstOrThrow()
    return { id: row.id }
  },
})
