//~ name: scenario-crud
//~ title: Scenario — full CRUD round-trip for one entity (create→list→update→delete, all asserted)
//~ entity: contact
//~ when: PHASE 7.5/7.6, once per CORE entity the user manages — pass that entity and it lands as its own `<entity>-crud.scenario.ts`. Proves a user can actually create, see, edit AND remove the object — each step read back and asserted, so a create that 200s into an empty list (scope/commit bug) fails LOUD. Pull `--name scenario` first for the starter; this is the backbone pattern on top of it.

// ===== FILE: packages/functions/test/scenarios/contact-crud.scenario.ts =====
import { pikkuScenario } from '#pikku/scenarios'

//~ create → assert it's in the list → update → assert the change → delete →
//~ assert it's gone. The 3rd arg is `{ scenario, actors }` (NOT `workflow`).
//~ NO identity id in {data} — the actor's SESSION owns the row; feeding your own
//~ userId/orgId makes write+read agree by construction and hides the real bug.
export const contactCrudScenario = pikkuScenario<void, { contactId: string }>({
  title: 'Contact CRUD (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    if (!actors?.visitor) throw new Error('needs run actors — run via `pikku scenario run <env>`')
    logger.debug('contact crud starting')
    //~ CREATE — no identity id in {data}; the session owns it.
    const created = await scenario.do(
      'create a contact',
      'createContact',
      { name: 'Ada Lovelace', email: 'ada@example.com' },
      { actor: actors.visitor },
    )
    //~ READ-BACK — the new row MUST appear, or the write didn't land where the read looks.
    const list = await scenario.do(
      'it shows in the list',
      'listContacts',
      {},
      { actor: actors.visitor },
    )
    if (!list.contacts.some((c) => c.id === created.contact.id)) {
      throw new Error(
        'createContact returned success but the contact is NOT in listContacts — scope/commit bug',
      )
    }
    //~ UPDATE — then read back and assert the change actually persisted.
    await scenario.do(
      'rename the contact',
      'updateContact',
      { id: created.contact.id, name: 'Ada King' },
      { actor: actors.visitor },
    )
    const afterEdit = await scenario.do(
      'the rename persisted',
      'getContact',
      { id: created.contact.id },
      { actor: actors.visitor },
    )
    if (afterEdit.contact.name !== 'Ada King') {
      throw new Error(
        'updateContact returned success but the name did not change — mutation did not persist',
      )
    }
    //~ DELETE — then assert it's actually gone from the list.
    await scenario.do(
      'delete the contact',
      'deleteContact',
      { id: created.contact.id },
      { actor: actors.visitor },
    )
    const afterDelete = await scenario.do(
      'it is gone from the list',
      'listContacts',
      {},
      { actor: actors.visitor },
    )
    if (afterDelete.contacts.some((c) => c.id === created.contact.id)) {
      throw new Error(
        'deleteContact returned success but the contact is STILL in the list — delete did not persist',
      )
    }
    return { contactId: created.contact.id }
  },
})
