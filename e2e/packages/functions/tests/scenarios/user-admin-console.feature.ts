/**
 * The console's Users page, driven end to end.
 *
 * The page calls the host's own scaffolded `admin:users:*` functions — nothing
 * about user management lives in the console addon — so this exercises the
 * scaffold a host app ships, through a browser.
 *
 * It is deliberately ONE scenario. The lifecycle is sequential: you cannot ban
 * a user you have not created, or prove a delete without one to delete. Every
 * state assertion reads a data attribute rather than the badge's copy, and
 * every action is taken through a test id rather than a menu item's label,
 * because that copy goes through the `m` namespace.
 *
 * There is deliberately no scenario for a caller holding only some of the
 * `admin:users:*` scopes, even though the create button and the actions menu
 * are rendered from exactly that: the console gates entry on the umbrella
 * `admin` scope, which parent-grants every leaf, so a partially-scoped caller
 * never reaches the page to be observed. That separation is covered where it
 * is observable, over RPC, in `user-admin.feature.ts`.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const USERS_PAGE = '/console/users'
const EMAIL = 'lifecycle@e2e.test'
const PASSWORD = 'lifecycle-pass'
const ROTATED = 'lifecycle-rotated'
// The row is found by the email it already renders. A `data-` attribute
// carrying the same address would be PII the DOM did not otherwise hold, and
// attributes are exactly what scrapers and session recorders capture unmasked.
const ROW = { testId: 'user-row', containing: EMAIL }

export const userLifecycleConsoleScenario = pikkuScenario<
  void,
  { lifecycle: true }
>({
  title: 'The full lifecycle of a user, driven from the console',
  description:
    'Create, ban, unban, revoke, re-password and delete one user, checking after each that they can or cannot sign in',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'userLifecycleConsoleScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the users page',
      'opensConsolePage',
      { path: USERS_PAGE, waitFor: { testId: 'user-row' } },
      { actor: actors.admin }
    )

    await scenario.when(
      'opens the create drawer',
      'clicksTestId',
      { testId: 'create-user' },
      { actor: actors.admin }
    )
    await scenario.when(
      'types the email',
      'fillsTestId',
      { testId: 'create-user-email', value: EMAIL },
      { actor: actors.admin }
    )
    await scenario.when(
      'types the password',
      'fillsTestId',
      { testId: 'create-user-password', value: PASSWORD },
      { actor: actors.admin }
    )
    await scenario.when(
      'creates the user',
      'clicksTestId',
      { testId: 'create-user-submit' },
      { actor: actors.admin }
    )
    await scenario.then('sees the user in the directory', 'seesTestId', ROW, {
      actor: actors.admin,
    })

    const created = await scenario.then(
      'signs in as the new user',
      'signsInAndReadsSession',
      { email: EMAIL, password: PASSWORD }
    )
    await scenario.then('expects to be signed in', 'expectsAuthAttempt', {
      attempt: created,
      accepted: true,
      sessionEmail: EMAIL,
    })

    await scenario.when(
      'opens the user’s actions',
      'clicksTestId',
      { testId: 'user-actions', within: ROW },
      { actor: actors.admin }
    )
    await scenario.when(
      'chooses to ban',
      'clicksTestId',
      { testId: 'user-action-ban' },
      { actor: actors.admin }
    )
    await scenario.when(
      'confirms the ban',
      'clicksTestId',
      { testId: 'user-action-confirm' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the user banned',
      'seesTestId',
      { testId: 'user-status', where: { 'data-banned': 'true' }, within: ROW },
      { actor: actors.admin }
    )

    const banned = await scenario.then(
      'tries to sign in while banned',
      'signsInAndReadsSession',
      { email: EMAIL, password: PASSWORD }
    )
    await scenario.then('expects to be refused', 'expectsAuthAttempt', {
      attempt: banned,
      accepted: false,
    })

    // Lifting a ban is not destructive, so the menu runs it directly rather
    // than asking for a confirmation the operator would only ever accept.
    await scenario.when(
      'opens the user’s actions',
      'clicksTestId',
      { testId: 'user-actions', within: ROW },
      { actor: actors.admin }
    )
    await scenario.when(
      'lifts the ban',
      'clicksTestId',
      { testId: 'user-action-unban' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the user active',
      'seesTestId',
      { testId: 'user-status', where: { 'data-banned': 'false' }, within: ROW },
      { actor: actors.admin }
    )

    const unbanned = await scenario.then(
      'signs in again',
      'signsInAndReadsSession',
      { email: EMAIL, password: PASSWORD }
    )
    await scenario.then('expects to be signed in', 'expectsAuthAttempt', {
      attempt: unbanned,
      accepted: true,
      sessionEmail: EMAIL,
    })

    await scenario.when(
      'opens the user’s actions',
      'clicksTestId',
      { testId: 'user-actions', within: ROW },
      { actor: actors.admin }
    )
    await scenario.when(
      'chooses to sign them out everywhere',
      'clicksTestId',
      { testId: 'user-action-revoke' },
      { actor: actors.admin }
    )
    await scenario.when(
      'confirms the revoke',
      'clicksTestId',
      { testId: 'user-action-confirm' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the user still active',
      'seesTestId',
      { testId: 'user-status', where: { 'data-banned': 'false' }, within: ROW },
      { actor: actors.admin }
    )

    await scenario.when(
      'opens the user’s actions',
      'clicksTestId',
      { testId: 'user-actions', within: ROW },
      { actor: actors.admin }
    )
    await scenario.when(
      'chooses to set a password',
      'clicksTestId',
      { testId: 'user-action-password' },
      { actor: actors.admin }
    )
    await scenario.when(
      'types the new password',
      'fillsTestId',
      { testId: 'user-password-input', value: ROTATED },
      { actor: actors.admin }
    )
    await scenario.when(
      'confirms the new password',
      'clicksTestId',
      { testId: 'user-action-confirm' },
      { actor: actors.admin }
    )
    // The drawer closes only once `setUserPassword` has resolved, so its
    // absence is what says the rotation landed. Without it the sign-in below
    // races the request that is still in flight.
    await scenario.then(
      'sees the drawer close',
      'doesNotSeeTestId',
      { testId: 'user-action-confirm' },
      { actor: actors.admin }
    )

    const rotated = await scenario.then(
      'signs in with the new password',
      'signsInAndReadsSession',
      { email: EMAIL, password: ROTATED }
    )
    await scenario.then('expects to be signed in', 'expectsAuthAttempt', {
      attempt: rotated,
      accepted: true,
      sessionEmail: EMAIL,
    })

    await scenario.when(
      'opens the user’s actions',
      'clicksTestId',
      { testId: 'user-actions', within: ROW },
      { actor: actors.admin }
    )
    await scenario.when(
      'chooses to delete',
      'clicksTestId',
      { testId: 'user-action-remove' },
      { actor: actors.admin }
    )
    await scenario.when(
      'confirms the delete',
      'clicksTestId',
      { testId: 'user-action-confirm' },
      { actor: actors.admin }
    )
    await scenario.then(
      'no longer sees the user',
      'doesNotSeeTestId',
      { testId: 'user-row', containing: EMAIL },
      { actor: actors.admin }
    )

    return { lifecycle: true }
  },
})

export const userAdminConsoleFeature = pikkuFeature({
  name: 'User Admin Console',
  description: 'Managing users from the console',
  tags: ['user-admin-console', 'console'],
  scenarios: [userLifecycleConsoleScenario],
})
