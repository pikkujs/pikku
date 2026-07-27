/**
 * Installing an addon from the console.
 *
 * Installing adds the package and writes a `<name>.addon.ts` wiring, so one
 * package can be wired under a name you choose. The naming is what the first
 * two scenarios are about: re-using a name that is already wired has to surface
 * as a clean inline error rather than a raw 500, and a name that is not a valid
 * namespace has to be refused before it ever reaches the server. The third
 * installs for real and is quarantined — see the note above it.
 *
 * The fixture project already wires "mailgun" (@pikku/addon-mailgun), so that
 * is the name to collide with. @pikku/addon-email-send and
 * @pikku/addon-mandrill are in the catalogue but not wired, so their cards open
 * the install drawer.
 *
 * The error text is asserted as text on purpose: it is the *server's* typed
 * error message surfaced inline, not console copy, so it does not go through
 * the `m` namespace and is the actual subject of the assertion. A raw 500
 * would surface a different, generic message and fail here.
 */
import { rm } from 'node:fs/promises'
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const ADDONS_PAGE = '/console/addons'
const UNWIRED_ADDON = '@pikku/addon-email-send'
const FRESH_ADDON = '@pikku/addon-mandrill'
const FRESH_INSTANCE = 'mandrill-e2e'

/**
 * Installing writes `packages/functions/src/addons/<name>.addon.ts` into the
 * fixture project. Remove it so the run stays hermetic — otherwise the wiring
 * lingers and the next `pikku dev` boot loads a stray addon.
 */
const FRESH_WIRING = new URL(
  '../../src/addons/mandrill-e2e.addon.ts',
  import.meta.url
)

const removesInstalledAddon = async () => {
  await rm(FRESH_WIRING, { force: true })
}

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

// TODO: This mutates the fixture and triggers a `pikku dev` reinspection.
// The REMOVAL side is now fixed: `pikku dev` reconciles the in-memory addon
// registry on delete (reconcileAddonRegistry prunes the unwired package —
// proven live: "• Removed unwired addon "<name>""), so the After hook's
// cleanup no longer leaves a stale in-memory addon that makes re-runs racy.
// But the FORWARD install->setup path still fails against a persistent dev
// server: after "Add to project" writes the wiring, PackageDetailPage polls
// console:getAddonInstalledPackage for only ~20s (pollExpired) before
// rendering "Package not found". Re-inspection + installed-package registry
// population takes longer than that window here (full regen observed 6-10s+),
// so the Setup tab never appears. Un-skip once (a) the console poll window
// covers the actual re-inspection time / getAddonInstalledPackage returns the
// freshly-wired addon promptly, or (b) the harness gives each mutating
// scenario a fast fresh server. Runs green against a fresh server (CI).
//
// A SECOND blocker was found while migrating this off cucumber, independent of
// the first: `console:installAddon` shells out to `npm install`, and this
// project is a yarn workspace whose manifests use `workspace:*`, which npm
// refuses (`EUNSUPPORTEDPROTOCOL`). So the install 500s here before the poll
// window is ever reached. Both have to be gone before this can be un-skipped.
export const installAddonFreshNameScenario = pikkuScenario<
  void,
  { installed: string }
>({
  title: 'Installing an addon under a fresh name lands on its setup',
  description:
    'A fresh install writes the wiring and routes to the new instance setup',
  tags: ['scenario', 'console-install-addon', 'console', 'mutates-project'],
  skip: 'installs into the fixture: needs a re-inspection a persistent dev server is too slow to finish, and npm cannot install inside this yarn workspace — see the note above',
  after: removesInstalledAddon,
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'installAddonFreshNameScenario needs the admin actor — run via `pikku scenario run <environment>`'
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
      { packageName: FRESH_ADDON },
      { actor: actors.admin }
    )
    await scenario.when(
      'names the instance',
      'fillsTestId',
      { testId: 'addon-install-name', value: FRESH_INSTANCE },
      { actor: actors.admin }
    )
    await scenario.when(
      'adds it to the project',
      'clicksTestId',
      { testId: 'addon-install-submit' },
      { actor: actors.admin }
    )
    await scenario.then(
      'lands on the new instance setup',
      'landsOnAddonSetup',
      { packageName: FRESH_ADDON },
      { actor: actors.admin }
    )

    return { installed: FRESH_INSTANCE }
  },
})

export const consoleInstallAddonFeature = pikkuFeature({
  name: 'Console Install Addon',
  description: 'Naming an addon instance when installing it from the console',
  tags: ['console-install-addon', 'console'],
  scenarios: [
    installAddonNameConflictScenario,
    installAddonInvalidNameScenario,
    installAddonFreshNameScenario,
  ],
})
