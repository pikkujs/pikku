/**
 * The console personas page: the people this product is declared to be for.
 *
 * Personas used to be readable only as a panel hanging off the scenarios page,
 * which said they were a testing artefact. They are now the same declaration a
 * virtual user runs as and the knowledge base resolves `persona:` URIs against,
 * so they get a page — and this feature is what holds it to being one.
 *
 * Everything asserted here is project data or a test id, never console copy:
 * the page's own labels go through the `m` namespace and would break the moment
 * the console is translated.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const PERSONAS_PAGE = '/console/personas'

export const personasListedScenario = pikkuScenario<void, { listed: number }>({
  title: 'Every declared persona has a row on the personas page',
  description:
    'An admin opens the personas page and finds everyone definePersonas declares',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'personasListedScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the personas page',
      'opensConsolePage',
      { path: PERSONAS_PAGE, waitFor: { testId: 'persona-row-admin' } },
      { actor: actors.admin }
    )

    // Written out one person at a time rather than looped: a scenario is a
    // recorded script, and a loop over an inline list is not something the DSL
    // can record. `target` is in the list on purpose — someone who only ever
    // gets acted upon is still one of the people this product is for, and a
    // page that hid them would be a page of runnable users under another name.
    await scenario.then(
      'sees shopper',
      'seesTestId',
      { testId: 'persona-row-shopper' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees support',
      'seesTestId',
      { testId: 'persona-row-support' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees admin',
      'seesTestId',
      { testId: 'persona-row-admin' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees staff',
      'seesTestId',
      { testId: 'persona-row-staff' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees guest',
      'seesTestId',
      { testId: 'persona-row-guest' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees target',
      'seesTestId',
      { testId: 'persona-row-target' },
      { actor: actors.admin }
    )

    return { listed: 6 }
  },
})

export const personaRolesScenario = pikkuScenario<void, { opened: true }>({
  title: "A persona's profile names the roles they hold and what those confer",
  description:
    'Opening admin shows both their system roles, each expanded to its scopes',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'personaRolesScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the personas page',
      'opensConsolePage',
      { path: PERSONAS_PAGE, waitFor: { testId: 'persona-row-admin' } },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the admin persona',
      'clicksTestId',
      { testId: 'persona-row-admin' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the profile',
      'seesTestId',
      { testId: 'persona-detail-admin' },
      { actor: actors.admin }
    )

    await scenario.then(
      'sees the platform-admin role',
      'seesTestId',
      { testId: 'persona-role-platform-admin' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the console-admin role',
      'seesTestId',
      { testId: 'persona-role-console-admin' },
      { actor: actors.admin }
    )

    // A scope id is the app's own vocabulary rather than console copy, so it
    // survives translation — and it is the half of the profile that answers
    // what a 403 was about, which naming the role alone does not.
    await scenario.then(
      'sees a scope the role grants',
      'seesText',
      { text: 'pikku:scopes:manage' },
      { actor: actors.admin }
    )

    return { opened: true }
  },
})

export const personaTargetScenario = pikkuScenario<void, { flagged: true }>({
  title: 'A persona who is only ever acted upon is flagged as such',
  description:
    'target is declared runnable: false, and both the row and the profile say so',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'personaTargetScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the personas page',
      'opensConsolePage',
      { path: PERSONAS_PAGE, waitFor: { testId: 'persona-row-target' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees target flagged on the row',
      'seesTestId',
      { testId: 'persona-target-target' },
      { actor: actors.admin }
    )
    // Nobody else is: the flag has to distinguish, not decorate.
    await scenario.then(
      'sees no flag on a runnable persona',
      'doesNotSeeTestId',
      { testId: 'persona-target-admin' },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the target persona',
      'clicksTestId',
      { testId: 'persona-row-target' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the flag on the profile too',
      'seesTestId',
      { testId: 'persona-detail-target-target' },
      { actor: actors.admin }
    )

    return { flagged: true }
  },
})

export const personaAvatarScenario = pikkuScenario<void, { pictured: true }>({
  title: 'A declared avatar is shown, and its absence is not a broken image',
  description:
    'admin declares an avatarUrl and gets the picture; everyone else gets the generated visual',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'personaAvatarScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the personas page',
      'opensConsolePage',
      { path: PERSONAS_PAGE, waitFor: { testId: 'persona-row-admin' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the declared picture',
      'seesTestId',
      { testId: 'persona-avatar-admin' },
      { actor: actors.admin }
    )
    // The generated colour-and-icon avatar is not an `img`, so its absence
    // here is the assertion that nothing was derived on their behalf.
    await scenario.then(
      'sees no image where none was declared',
      'doesNotSeeTestId',
      { testId: 'persona-avatar-shopper' },
      { actor: actors.admin }
    )

    return { pictured: true }
  },
})

export const personaPersonalityScenario = pikkuScenario<
  void,
  { described: true }
>({
  title: 'A persona reads as a person, not a row in a permissions table',
  description:
    "Each row carries the persona's own personality line, and their disposition where they declare one",
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'personaPersonalityScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the personas page',
      'opensConsolePage',
      { path: PERSONAS_PAGE, waitFor: { testId: 'persona-row-shopper' } },
      { actor: actors.admin }
    )

    // The declared sentence itself: it is the brief a virtual user run hands
    // the model, so a page that paraphrased it would be describing a different
    // person from the one that actually runs.
    await scenario.then(
      "sees the shopper's personality",
      'seesText',
      { text: 'Impatient shopper who abandons slow checkouts' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the disposition they declare',
      'seesTestId',
      { testId: 'persona-disposition-shopper' },
      { actor: actors.admin }
    )
    // Admin declares none, so the chip has to be absent rather than defaulted:
    // `realistic` is what the engine falls back to, and printing it here would
    // put words in the declaration's mouth.
    await scenario.then(
      'sees no disposition where none was declared',
      'doesNotSeeTestId',
      { testId: 'persona-disposition-admin' },
      { actor: actors.admin }
    )

    return { described: true }
  },
})

export const platformSubjectScenario = pikkuScenario<void, { shown: true }>({
  title: 'The system is one of the actors, and is never mistaken for a person',
  description:
    'The platform has a row of its own behind the System filter, carrying the steps declared for it',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'platformSubjectScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the personas page',
      'opensConsolePage',
      { path: PERSONAS_PAGE, waitFor: { testId: 'persona-row-admin' } },
      { actor: actors.admin }
    )

    // The page opens on the people: the platform acts, but it holds no roles
    // and signs in as nobody, so leading with it would put the row nothing is
    // authorized through above the ones that are.
    await scenario.then(
      'sees no platform row until it asks for one',
      'doesNotSeeTestId',
      { testId: 'subject-row-platform' },
      { actor: actors.admin }
    )
    await scenario.when(
      'switches to the system actors',
      'clicksTestId',
      { testId: 'personas-filter-system' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the platform',
      'seesTestId',
      { testId: 'subject-row-platform' },
      { actor: actors.admin }
    )
    // Declared, so the row has to carry it — a subject's steps are the whole of
    // what it can do, the way a person's roles are.
    await scenario.then(
      'sees a step the platform takes',
      'seesText',
      { text: 'Ships The Order' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it marked as not a person',
      'seesTestId',
      { testId: 'subject-not-a-person-platform' },
      { actor: actors.admin }
    )
    // And the people are gone while it is filtered, so the two are never read
    // as one list of users.
    await scenario.then(
      'sees no people under the system filter',
      'doesNotSeeTestId',
      { testId: 'persona-row-admin' },
      { actor: actors.admin }
    )

    return { shown: true }
  },
})

export const personasConsoleFeature = pikkuFeature({
  name: 'Personas Console Page',
  description:
    'The console reads personas as people — their roles, their picture and whether they are ever run',
  tags: ['personas-console', 'console'],
  scenarios: [
    personasListedScenario,
    personaRolesScenario,
    personaTargetScenario,
    personaAvatarScenario,
    personaPersonalityScenario,
    platformSubjectScenario,
  ],
})
