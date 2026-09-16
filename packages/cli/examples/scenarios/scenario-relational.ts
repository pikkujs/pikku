//~ name: scenario-relational
//~ title: Scenario — parent→child RELATIONSHIP link (thread a REAL created id, never a fake one)
//~ when: PHASE 7.5/7.6, whenever entities REFERENCE each other (a contact belongs to a company, a task to a project, a line-item to an order). This is the pattern that KILLS the #1 scenario anti-pattern — poking `listContacts({ companyId: 'fake-id' })`. A journey THREADS the parent's real returned id into the child, then asserts the child shows UNDER the parent. Pull `--name scenario` first. This one is WRITTEN to `packages/functions/test/scenarios/company-contact-link.scenario.ts` and names TWO entities (company + contact) — rename both to yours in the file, since `--entity` only carries one.
// ===== FILE: packages/functions/test/scenarios/company-contact-link.scenario.ts =====
import { pikkuScenario } from '#pikku/scenarios'

//~ The whole game: capture the id the PARENT create RETURNS, pass it to the CHILD
//~ create, then assert the child shows up when you filter by that parent.
//~
//~   ❌ NEVER  scenario.do('list contacts', 'listContacts', { companyId: 'fake-id' }, …)
//~   ❌ NEVER  a pile of one-call-per-endpoint steps with made-up ids/search terms —
//~             that's a CRUD sweep, not a journey; it filters over nothing and
//~             asserts nothing (nobody uses an app that way).
//~   ✅ ALWAYS  parent create → capture id → child create with that id → assert link.
//~
//~ NOTE: a domain foreign key like `companyId` (WHICH company this contact is in) is
//~ fine in {data} — that is real relational data. It is NOT the same as an identity
//~ id (userId/organizationId/tenantId), which must come from the SESSION, never {data}.
//~ 3rd arg is `{ scenario, actors }` (NOT `workflow`).
export const companyContactLinkScenario = pikkuScenario<void, { companyId: string }>({
  title: 'Company → contact link (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.visitor) throw new Error('needs run actors — run via `pikku scenario run <env>`')
    logger.debug('company/contact link starting')
    //~ 1. create the PARENT — capture its REAL id.
    const company = await scenario.do(
      'create a company',
      'createCompany',
      { name: 'Acme Inc' },
      { actor: actors.visitor },
    )
    //~ 2. create the CHILD referencing the parent's REAL id (never a literal/fake id).
    const contact = await scenario.do(
      'add a contact to it',
      'createContact',
      { name: 'Grace Hopper', companyId: company.company.id },
      { actor: actors.visitor },
    )
    //~ 3. ASSERT the relationship resolves: filtering by the parent returns the child.
    const contacts = await scenario.do(
      'the contact shows under the company',
      'listContacts',
      { companyId: company.company.id },
      { actor: actors.visitor },
    )
    if (!contacts.contacts.some((c) => c.id === contact.contact.id)) {
      throw new Error(
        "the contact was created with a companyId but does NOT show when listing that company's contacts — the FK or the join is wrong",
      )
    }
    return { companyId: company.company.id }
  },
})
