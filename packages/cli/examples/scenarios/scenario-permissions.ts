//~ name: scenario-permissions
//~ title: Scenario — the permission-DENIED path (a member forbidden from an admin action)
//~ entity: deal
//~ when: PHASE 7.5/7.6, when the app has ROLES (admin vs member, owner vs viewer). A user being correctly BLOCKED is a real, must-test journey — it proves the `permissions` gate actually fires. Needs a second seeded actor (`member`); add that persona to definePersonas in packages/functions/src/personas.ts. Pull `--name scenario` first.
// ===== FILE: packages/functions/test/scenarios/member-cannot-delete.scenario.ts =====
import { pikkuScenario } from '#pikku/scenarios'

//~ scenario.expectError SUCCEEDS only when the RPC THROWS — never treat the throw
//~ as a failure; it returns the thrown message. The member persona is a data-only
//~ seeded user (see PHASE 2.5). 3rd arg is `{ scenario, actors }` (NOT `workflow`).
export const memberCannotDeleteScenario = pikkuScenario<void, { denied: boolean }>({
  title: 'Member cannot delete (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    const member = actors?.member ?? actors?.visitor
    if (!member) throw new Error('needs run actors (member) — run via `pikku scenario run <env>`')
    logger.debug('permission-denied starting')
    //~ The admin creates something (actors.visitor is the dev admin), then the
    //~ member is DENIED deleting it. expectError returns the thrown message.
    const created = await scenario.do(
      'admin creates a deal',
      'createDeal',
      { title: 'Protected', stage: 'lead' },
      { actor: actors.visitor },
    )
    const message = await scenario.expectError(
      'a member cannot delete it',
      'deleteDeal',
      { id: created.deal.id },
      { actor: member },
    )
    logger.debug(`member correctly denied: ${message}`)
    return { denied: true }
  },
})
