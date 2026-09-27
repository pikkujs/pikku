//~ name: scenario
//~ title: Scenario — prove the app's CORE journey works end-to-end over real RPCs
//~ entity: todo
//~ when: PHASE 7.5, and EVERY app needs one. The single core-journey STARTER — a signed-in actor drives the app's ONE main happy path over the real transport. Start here, then pull the SPECIFIC extra patterns you need by name — `--name scenario-crud` (full round-trip), `scenario-relational` (parent→child link), `scenario-transition` (status move), `scenario-permissions` (denied path), `scenario-multitenant` (tenant isolation), `scenario-scheduled` (cron/eventual). Every step must ASSERT its outcome — read a write back and THROW if the effect is not there; a step that only proves "the RPC didn't throw" is a fake gate. NEVER put a userId/organizationId/tenantId in {data}: identity comes from the actor's SESSION, and supplying your own scope makes write+read agree by construction and hides the exact bug this proves. Point each step at YOUR RPC names and rename `visitor` to one of the personas you declared.
//~ steps:
//~ A scenario tells ONE happy-path story as a synthetic persona (an "actor" — pikku
//~ materialises one actor per persona you declared with definePersonas, so there is
//~ no actor list to maintain and nothing ships by default — `visitor` in the written
//~ file is a placeholder, rename it to one of YOUR declared persona ids). Each
//~ scenario.do step calls a REAL exposed RPC BY NAME with the actor's session
//~ cookie; the {data} must satisfy that RPC's input. Rename the written file to YOUR
//~ core journey calling YOUR RPCs. Types are GENERICS <Input, Output> — a scenario is
//~ a story, not a schema'd function, so there is NO input/output zod here (and no
//~ PKU489/PKU456).
//~
//~ AUTO-REGISTERS from the export (no wire call): pikku codegen discovers every
//~ pikkuScenario in a *.scenario.ts. After writing it, run pikku-verify ONCE to
//~ register, then pikku-scenario to run it. A failing step names the RPC + error —
//~ fix the pikku function behind it, NEVER weaken the scenario.
//~
//~ ⚠️ THE 3RD ARG IS `{ scenario, actors }` — NOT `workflow`. The scenario DSL is
//~ bound to `scenario` (scenario.do / scenario.expectEventually / …). `workflow.*`
//~ is the DSL you use INSIDE a pikkuWorkflow func — it does NOT exist here and is
//~ `undefined` at runtime. Destructure `{ scenario, actors }`.
//~
//~ ⚠️ ASSERT THE OUTCOME — a step that only checks "the RPC didn't throw" PROVES
//~ NOTHING. The #1 way a build ships broken-but-green is a scenario that creates a
//~ row, calls list, and never checks the row is IN the list: `createContact` can
//~ return 200 while `listContacts` returns [] (wrong scope, uncommitted write, a
//~ tenant filter that doesn't match) and BOTH "pass". So after every WRITE, READ it
//~ back and THROW if the effect isn't there — assert the created id appears in the
//~ list, assert an update is reflected, assert a status move actually moved. The
//~ result of every scenario.do is returned to you; use it. An un-asserted read is a
//~ fake gate. (Identity comes from the actor's SESSION — NEVER pass a userId /
//~ organizationId / tenantId in {data}: a scenario that supplies its own scope makes
//~ write+read agree by construction and HIDES the exact session-scoping bug this
//~ gate exists to catch. If an RPC's input schema even HAS such a field, that
//~ function is wrong — fix it to read the id from the session, don't feed it here.)
//~
//~ THE SCENARIO VERBS (the 3rd arg `scenario` has more than `.do`):
//~  • scenario.do(step, rpc, data, { actor })            — call an RPC, return its output.
//~  • scenario.expectEventually(step, rpc, data, pred, { actor, within }) — POLL the RPC
//~    until `pred(output)` is true (or `within` ms elapse). The clean way to assert a
//~    write landed: `scenario.expectEventually('shows in list', 'listTodos', {}, o => o.todos.some(t => t.id === id), { actor })`.
//~  • scenario.expectError(step, rpc, data, { actor })   — SUCCEEDS only when the RPC
//~    THROWS; returns the message. Use for the permission-DENIED path (a member hitting
//~    an admin-only action) — never treat the throw as a failure.
//~  • scenario.runScheduledTask('taskName')              — fire a cron/scheduled task
//~    IMMEDIATELY so a scenario can cover it (no waiting for the schedule). Queue jobs
//~    run when their enqueue RPC is called in a step. ONLY a `scenario.sleep` step is
//~    genuinely un-drivable synchronously — so cover cron + queue functions too.
//~
//~ THE THREE STEPS THE WRITTEN SCENARIO IS MADE OF, in order:
//~  1. The first WRITE the user makes (create the app's main entity). Call the real
//~     create RPC; {data} must match that function's input schema. NO identity id in
//~     {data} — the actor's session owns the row.
//~  2. READ IT BACK AND ASSERT. The list MUST now contain step 1's row. This is the
//~     assertion that would have caught "create returns 200 but the row never shows".
//~     If it's missing, THROW — that is a real, must-fix app break.
//~  3. An UPDATE that completes the journey, then ASSERT it took effect.
//~ Keep it to the ONE core happy path. Return anything useful for assertions.
//~
//~ ═══ THE FEATURE — group the scenarios for ONE AREA of the app and SAY WHAT IT PROMISES ═══
//~ One pikkuFeature per AREA, alone in its own `test/features/<domain>.feature.ts`,
//~ importing each scenario from its own `test/scenarios/*.scenario.ts` file.
//~ A feature is NOT a milestone: it is named for something a person can DO here and it
//~ outlives the milestone that started it, so a later milestone extending this area adds
//~ its scenarios to THIS file rather than opening a second one beside it. Its `name` is
//~ that area in the app's own words, and `scenarios` grows as you write each one.
//~ A loose pile of scenario exports runs, but says nothing about what the app claims
//~ to do; a feature is the acceptance criteria in the DOMAIN's words — name and
//~ description written for the person who asked for the app, not for the test runner.
//~ Green feature = that promise genuinely holds, not merely compiles.
//~ EVERY PERSONA GETS DRIVEN AS ITSELF: the personas you declared with definePersonas
//~ (the definePersonas call lists them) materialise one actor each, so the cafe
//~ owner's journey runs `{ actor: actors.cafeOwner }` and the reviewer's runs as the
//~ reviewer. Driving every journey as ONE actor makes write-then-read agree by
//~ construction and hides the scoping/permission bugs this gate exists to catch; a
//~ persona no scenario names is a person whose experience is UNPROVEN.

// ===== FILE: packages/functions/test/scenarios/core-journey.scenario.ts =====
import { pikkuScenario } from '#pikku/scenarios'

export const coreJourneyScenario = pikkuScenario<void, { todoId: string }>({
  title: 'Core journey (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.visitor) {
      throw new Error(
        'coreJourneyScenario needs run actors (visitor) — run via `pikku scenario run <environment>`',
      )
    }
    logger.debug('core journey starting')
    const created = await scenario.do(
      'visitor creates a todo',
      'createTodo',
      { title: 'Buy milk' },
      { actor: actors.visitor },
    )
    const list = await scenario.do(
      'the todo shows in their list',
      'listTodos',
      {},
      { actor: actors.visitor },
    )
    if (!list.todos.some((t) => t.id === created.todo.id)) {
      throw new Error(
        'createTodo returned success but the new todo is NOT in listTodos — the write did not land where the read looks (scope/commit bug)',
      )
    }
    await scenario.do(
      'visitor completes the todo',
      'updateTodo',
      { id: created.todo.id, done: true },
      { actor: actors.visitor },
    )
    const after = await scenario.do(
      'the todo now reads as done',
      'listTodos',
      {},
      { actor: actors.visitor },
    )
    const updated = after.todos.find((t) => t.id === created.todo.id)
    if (!updated?.done) {
      throw new Error(
        'updateTodo returned success but the todo did not actually change to done — the mutation did not persist',
      )
    }
    return { todoId: created.todo.id }
  },
})

// ===== FILE: packages/functions/test/features/todos.feature.ts =====
import { pikkuFeature } from '#pikku/scenarios'
import { coreJourneyScenario } from '../scenarios/core-journey.scenario.js'

export const todosFeature = pikkuFeature({
  name: 'Todos',
  description: 'A signed-in user can capture a todo, see it in their list, and complete it',
  tags: ['todos'],
  scenarios: [coreJourneyScenario],
})
