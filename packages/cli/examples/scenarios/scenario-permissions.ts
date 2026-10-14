//~ name: scenario-permissions
//~ title: Scenario — the permission-DENIED path (a member forbidden from an admin action)
//~ entity: deal
//~ when: PHASE 7.5/7.6, when the app has ROLES (admin vs member, owner vs viewer). A user being correctly BLOCKED is a real, must-test journey — it proves the `permissions` gate actually fires. Needs a second seeded virtual user (`member`); add that virtual user to defineVirtualUsers in packages/functions/src/virtual-users.ts. Pull `--name scenario` first.
// ===== FILE: packages/functions/test/scenarios/member-cannot-delete.scenario.ts =====
import { pikkuScenario } from '#pikku/scenarios'

//~ scenario.expectError SUCCEEDS only when the RPC THROWS — never treat the throw
//~ as a failure; it returns the thrown message. The member virtual user is a data-only
//~ seeded user (see PHASE 2.5). 3rd arg is `{ scenario, virtualUsers }` (NOT `workflow`).
export const memberCannotDeleteScenario = pikkuScenario<void, { denied: boolean }>({
  title: 'Member cannot delete (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, _input, { scenario, virtualUsers }) => {
    const member = virtualUsers?.member ?? virtualUsers?.visitor
    if (!member) throw new Error('needs run virtual users (member) — run via `pikku scenario run <env>`')
    logger.debug('permission-denied starting')
    //~ The admin creates something (virtualUsers.visitor is the dev admin), then the
    //~ member is DENIED deleting it. expectError returns the thrown message.
    const created = await scenario.do(
      'admin creates a deal',
      'createDeal',
      { title: 'Protected', stage: 'lead' },
      { virtualUser: virtualUsers.visitor },
    )
    const message = await scenario.expectError(
      'a member cannot delete it',
      'deleteDeal',
      { id: created.deal.id },
      { virtualUser: member },
    )
    logger.debug(`member correctly denied: ${message}`)
    return { denied: true }
  },
})
