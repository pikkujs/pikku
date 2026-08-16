/**
 * Run captures, exercised end to end.
 *
 * The unit tests in `@pikku/playwright` cover the naming and the ffmpeg
 * fallback; what they cannot cover is whether a real `pikku scenario run`
 * actually threads `--screenshots` through the CLI, the driver and the actor
 * session and leaves files on disk. That is what this scenario is for, and it
 * is why the descriptions below are fixed strings: `tests/cli/scenario-run.test.ts`
 * asserts on the exact filenames they produce.
 *
 * It is deliberately a normal scenario, not a capture-only one — with the flag
 * off `browser.screenshot()` writes nothing and the scenario still passes, so
 * this also pins the promise that taking pictures never breaks a plain run.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

export const captureScenario = pikkuScenario<void, { captures: number }>({
  title: 'A run captures screenshots of the console',
  description:
    'An admin opens two console pages and photographs each one, so the run leaves something to look at',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'captureScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the addons page',
      'opensConsolePage',
      { path: '/console/addons' },
      { actor: actors.admin }
    )
    await scenario.then(
      'photographs the addons gallery',
      'capturesTheScreen',
      { description: 'Addons gallery' },
      { actor: actors.admin }
    )

    await scenario.when(
      'opens the functions page',
      'opensConsolePage',
      { path: '/console/functions' },
      { actor: actors.admin }
    )
    await scenario.then(
      'photographs the functions list',
      'capturesTheScreen',
      { description: 'Functions list' },
      { actor: actors.admin }
    )

    return { captures: 2 }
  },
})

export const capturesFeature = pikkuFeature({
  name: 'Run Captures',
  description:
    'A scenario run can photograph the pages it visits, and does not depend on being asked to',
  tags: ['captures', 'console'],
  scenarios: [captureScenario],
})
