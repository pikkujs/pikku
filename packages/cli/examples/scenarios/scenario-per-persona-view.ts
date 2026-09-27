//~ name: scenario-per-persona-view
//~ title: Scenario — each colleague sees THEIR OWN app (browser, one scenario per persona)
//~ entity: job
//~ when: PHASE 7.5/7.6, whenever TWO OR MORE personas share ONE app — a mechanic and a counter clerk, an accountant and HR and procurement. Colleagues share an app and differ by nav, landing screen and permitted actions, and NOTHING else proves they actually do: an app that renders one identical shell for all of them passes every other gate green. This runs in a REAL BROWSER as each person in turn, so it is the feature that speaks for "logging in as the mechanic is not the same as logging in as the desk". Needs each persona declared in definePersonas. Pull `--name scenario` first for the RPC-level shape.
// ===== FILE: packages/functions/test/scenarios/mechanic-sees-their-work.scenario.ts =====
import { pikkuScenario } from '#pikku/scenarios'

//~ THE NAMES BELOW ARE A WORKSHOP'S, AND THEY ARE NOT YOURS. `mechanic`, `desk`,
//~ "work queue", "front of house" — every one is an EXAMPLE. Rename each to a persona
//~ your `definePersonas` actually declares, in the export name, the title, the
//~ description, the `actors.<name>` lookups and the thrown message. A merch build
//~ pasted this verbatim and shipped `mechanicSeesTheirWorkScenario` and
//~ `deskSeesTheFrontOfHouseScenario` into a t-shirt shop: both reference actors that
//~ do not exist, so both fail on every run and neither failure means anything.
//~
//~ ONE SCENARIO PER PERSONA — never one scenario looping over actors. A failure has to
//~ name WHO was let down ("the mechanic never got a work queue"), and a loop collapses
//~ every person into one red line that says nothing about which of them is broken.
//~
//~ THE LADDER IS `when` → `then`, NOT `do`. `do` is the RPC path; the browser steps
//~ (opensPage, restsOnPath, seesText, clicks, fills) are reached through when/then and are
//~ typed against the declared steps in test/steps/. Only a `then` counts toward witness
//~ coverage — a ladder with no `then` fails inspection outright (PKU680).
//~
//~ TAG IT `smoke`. That is what puts it in the browser sweep `pikku scenario browser --tag smoke` runs; an
//~ untagged browser scenario is registered and never driven.
export const mechanicSeesTheirWorkScenario = pikkuScenario<void, { pathname: string }>({
  title: 'The mechanic lands on their own work queue',
  description: 'A mechanic signs in and gets the workshop floor, not the front desk',
  tags: ['scenario', 'smoke'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.mechanic) {
      throw new Error(
        'mechanicSeesTheirWorkScenario needs the mechanic actor — run via `pikku scenario run <environment>`',
      )
    }

    const landed = await scenario.when(
      'the mechanic opens the app',
      'opensPage',
      { path: '/app' },
      { actor: actors.mechanic },
    )

    //~ WHERE THEY LAND IS HALF THE CLAIM. Two roles sharing an app usually differ first by
    //~ home screen — the mechanic's is the job queue, the clerk's is the day's bookings. If
    //~ your app sends everyone to the same route, assert the same path in both scenarios and
    //~ let the seesText below carry the whole difference.
    await scenario.then(
      'they come to rest on the workshop floor',
      'restsOnPath',
      { path: '/app/jobs' },
      { actor: actors.mechanic },
    )

    //~ THE ASSERTION THAT DOES THE WORK: text only THIS person's screen offers. You do not
    //~ need a "does not see" step to prove differentiation — if both personas land on the
    //~ same undifferentiated shell, one of these two scenarios cannot find its text and goes
    //~ red. That is exactly the failure worth catching, and it names the person it failed.
    //~ Assert something ROLE-SHAPED (a heading, a nav item, an action only they get), never
    //~ a row of seeded data — data drifts, and a passing run then proves nothing.
    await scenario.then(
      'their assigned repairs are on screen',
      'seesText',
      { text: 'Assigned repairs' },
      { actor: actors.mechanic },
    )

    return { pathname: landed.pathname }
  },
})

// ===== FILE: packages/functions/test/scenarios/desk-sees-the-front-of-house.scenario.ts =====
import { pikkuScenario } from '#pikku/scenarios'

//~ The SAME shape for the other colleague. Side by side these two are the whole point: same
//~ app, same sign-in, two different screens. Copy this per persona sharing the app.
export const deskSeesTheFrontOfHouseScenario = pikkuScenario<void, { pathname: string }>({
  title: 'The counter clerk lands on the front desk',
  description: 'A clerk signs in and gets bookings and customers, not the repair queue',
  tags: ['scenario', 'smoke'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.counter) {
      throw new Error(
        'deskSeesTheFrontOfHouseScenario needs the counter actor — run via `pikku scenario run <environment>`',
      )
    }

    const landed = await scenario.when(
      'the clerk opens the app',
      'opensPage',
      { path: '/app' },
      { actor: actors.counter },
    )

    await scenario.then(
      'they come to rest on the front desk',
      'restsOnPath',
      { path: '/app/bookings' },
      { actor: actors.counter },
    )

    await scenario.then(
      "today's bookings are on screen",
      'seesText',
      { text: "Today's bookings" },
      { actor: actors.counter },
    )

    return { pathname: landed.pathname }
  },
})

// ===== FILE: packages/functions/test/features/colleagues.feature.ts =====
import { pikkuFeature } from '#pikku/scenarios'
import { mechanicSeesTheirWorkScenario } from '../scenarios/mechanic-sees-their-work.scenario.js'
import { deskSeesTheFrontOfHouseScenario } from '../scenarios/desk-sees-the-front-of-house.scenario.js'

//~ ONE FEATURE for "the people who share this app", and its description is the promise in
//~ the owner's own words — not the test runner's. Green here means the shop owner can put
//~ two different colleagues in front of this app and each gets their own job, which is the
//~ thing they actually bought. Add a scenario here for EVERY persona in this app's
//~ app — every persona whose `app` names this slug: a persona no scenario names is a person
//~ whose experience is unproven, and the usual way that shows up in production is all of
//~ them staring at the same screen.
export const colleaguesFeature = pikkuFeature({
  name: 'Everyone gets their own workshop',
  description: 'The mechanic and the counter clerk each sign in and land on their own work',
  tags: ['colleagues', 'smoke'],
  scenarios: [mechanicSeesTheirWorkScenario, deskSeesTheFrontOfHouseScenario],
})
