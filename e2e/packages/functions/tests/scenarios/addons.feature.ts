/**
 * The console addons gallery.
 *
 * The catalogue comes from this project's own registry stub
 * (`src/mock-registry-server.ts`), not from the live Fabric registry, so the
 * counts below are exact: they describe a fixture this repo checks in, and a
 * catalogue that quietly lost rows fails here rather than passing a lower
 * bound. The installed side is not the registry's — the console left-joins what
 * the project actually wires — so those three names come from the fixture app.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

export const installedAddonsScenario = pikkuScenario<void, { addons: number }>({
  title: 'Installed addons are visible on the addons page',
  description:
    'An admin filters the addons gallery to what this project installs and finds every one of them',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'installedAddonsScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the addons page',
      'opensConsolePage',
      { path: '/console/addons' },
      { actor: actors.admin }
    )
    await scenario.when(
      'filters to installed addons',
      'selectsSegment',
      { value: 'installed' },
      { actor: actors.admin }
    )

    const installed = [
      '@pikku/addon-console',
      '@pikku/addon-todos',
      '@pikku/addon-emails',
    ]
    for (const packageName of installed) {
      await scenario.then(
        `sees ${packageName}`,
        'seesAddonCard',
        { packageName, state: 'installed' },
        { actor: actors.admin }
      )
    }

    return { addons: installed.length }
  },
})

export const communityAddonsScenario = pikkuScenario<void, { listed: true }>({
  title: 'Community addons are visible on the addons page',
  description:
    'An admin browses the whole catalogue and finds a publishable addon this project has not installed',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'communityAddonsScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the addons page',
      'opensConsolePage',
      { path: '/console/addons' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the whole catalogue',
      'countsAddonCards',
      { count: 14 },
      { actor: actors.admin }
    )
    await scenario.when(
      'searches for stripe',
      'searchesAddons',
      { query: 'stripe' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the search narrow to one addon',
      'countsAddonCards',
      { count: 1 },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the stripe addon offered',
      'seesAddonCard',
      { packageName: '@pikku/addon-stripe', state: 'available' },
      { actor: actors.admin }
    )

    return { listed: true }
  },
})

export const addonsFeature = pikkuFeature({
  name: 'Addons Page',
  description:
    'The console addons gallery lists what this project installs and what it could install',
  tags: ['addons', 'console'],
  scenarios: [installedAddonsScenario, communityAddonsScenario],
})
