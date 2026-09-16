//~ name: singleton-query
//~ title: "The caller's own X" read, where not having one yet is normal
//~ when: A screen reads ONE row belonging to the caller and its absence is a first-run state, not a 404 — the profile before it is filled in, the shop before it is claimed, the current draft.
//~ entity: profile

// ===== FILE: packages/functions/src/functions/get-my-profile.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { ProfileZ } from '#pikku/db/zod.gen.js'

//~ Different shape from the detail fetch in `list-query`: missing means the ONBOARDING
//~ screen, so `.executeTakeFirstOrThrow` is wrong (a 404 for the expected first-run state).
//~ THE TRAP: a func that returns `null` OR `undefined` is answered as **204 with NO
//~ BODY** (pikku's http runner treats both as "nothing to send"), so the generated
//~ client parses nothing and hands @tanstack/react-query `undefined` — which THROWS:
//~ "Query data cannot be undefined. Affected query key: [...]". A blank screen and a
//~ console error on every brand-new account, and no typecheck catches it because
//~ `.executeTakeFirst()`'s `undefined` satisfies an optional/nullable output.
//~ SO THE EMPTY ANSWER MUST STILL BE AN OBJECT: wrap the row in a named field and
//~ make THAT field nullable. Always a 200 with a real body; the screen branches on
//~ `data.profile === null` for its empty/onboarding state.
export const GetMyProfileInput = z.object({}) //~ no args — the session names the row
export const GetMyProfileOutput = z.object({
  //~ The WRAPPER is the point — `ProfileZ.pick({...}).nullable()` on its own would send
  //~ a bare null, which is the 204 above. Room to add siblings later, too.
  profile: ProfileZ.pick({ id: true, title: true }).nullable(),
})

export const getMyProfile = pikkuFunc({
  expose: true,
  readonly: true,
  auth: true,
  description: "Get the caller's own profile; `profile` is null until they make one.",
  input: GetMyProfileInput,
  output: GetMyProfileOutput,
  func: async ({ kysely }, _input, { session }) => {
    const row = await kysely
      .selectFrom('profile')
      .select(['id', 'title'])
      .where('userId', '=', session!.userId)
      .executeTakeFirst()
    //~ `?? null` because `undefined` inside the object would be dropped by
    //~ JSON.stringify — the field must be PRESENT and null.
    return { profile: row ?? null }
  },
})
