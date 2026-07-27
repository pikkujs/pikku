/**
 * Installing an addon from the console.
 *
 * Installing adds the package and writes a `<name>.addon.ts` wiring, so one
 * package can be wired under a name you choose. Both scenarios here are about
 * the naming: re-using a name that is already wired has to surface as a clean
 * inline error rather than a raw 500, and a name that is not a valid namespace
 * has to be refused before it ever reaches the server.
 *
 * The fixture project already wires "mailgun" (@pikku/addon-mailgun), so that
 * is the name to collide with. @pikku/addon-email-send is in the catalogue but
 * not wired, so its card opens the install drawer.
 *
 * The error text is asserted as text on purpose: it is the *server's* typed
 * error message surfaced inline, not console copy, so it does not go through
 * the `m` namespace and is the actual subject of the assertion. A raw 500
 * would surface a different, generic message and fail here.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const ADDONS_PAGE = '/console/addons'
const UNWIRED_ADDON = '@pikku/addon-email-send'

export const installAddonNameConflictScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'Re-using an installed name shows a clean conflict, not a 500',
  description:
    'Installing under a name the project already wires reports the conflict inline in the drawer',
  tags: ['scenario', 'console-install-addon', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'installAddonNameConflictScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the addons page',
      'opensConsolePage',
      { path: ADDONS_PAGE },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the drawer for an unwired addon',
      'opensAddonDrawer',
      { packageName: UNWIRED_ADDON },
      { actor: actors.admin }
    )
    await scenario.when(
      'names the instance after one already wired',
      'fillsTestId',
      { testId: 'addon-install-name', value: 'mailgun' },
      { actor: actors.admin }
    )
    await scenario.when(
      'adds it to the project',
      'clicksTestId',
      { testId: 'addon-install-submit' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the conflict reported inline',
      'seesTestId',
      {
        testId: 'addon-install-error',
        containing: 'already installed under the name',
      },
      { actor: actors.admin }
    )

    return { refused: true }
  },
})

export const installAddonInvalidNameScenario = pikkuScenario<
  void,
  { blocked: true }
>({
  title: 'An invalid instance name blocks install before it reaches the server',
  description:
    'A name that is not a valid namespace disables the install button, so it can never be submitted',
  tags: ['scenario', 'console-install-addon', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'installAddonInvalidNameScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the addons page',
      'opensConsolePage',
      { path: ADDONS_PAGE },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the drawer for an unwired addon',
      'opensAddonDrawer',
      { packageName: UNWIRED_ADDON },
      { actor: actors.admin }
    )
    await scenario.when(
      'types a name that is not a namespace',
      'fillsTestId',
      { testId: 'addon-install-name', value: 'Not A Namespace!' },
      { actor: actors.admin }
    )
    await scenario.then(
      'cannot add it to the project',
      'expectsControl',
      { testId: 'addon-install-submit', enabled: false },
      { actor: actors.admin }
    )

    return { blocked: true }
  },
})

export const consoleInstallAddonFeature = pikkuFeature({
  name: 'Console Install Addon',
  description: 'Naming an addon instance when installing it from the console',
  tags: ['console-install-addon', 'console'],
  scenarios: [
    installAddonNameConflictScenario,
    installAddonInvalidNameScenario,
  ],
})
