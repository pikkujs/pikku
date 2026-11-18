/**
 * Run captures, exercised end to end.
 *
 * The unit tests in `@pikku/playwright` cover the naming and the ffmpeg
 * fallback; what they cannot cover is whether a real `pikku scenario run`
 * actually threads `--screenshots` through the CLI, the driver and the virtual user
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
  title: 'A run captures screenshots of the app',
  description:
    'A visitor opens the app and its pricing page and photographs each one, so the run leaves something to look at',
  tags: ['scenario', 'captures', 'browser'],
  func: async (_services, _data, { scenario, virtualUsers }) => {
    if (!virtualUsers?.guest) {
      throw new Error(
        'captureScenario needs the guest virtual user — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the app',
      'opensPage',
      { path: '/app', waitFor: { testId: 'app' } },
      { virtualUser: virtualUsers.guest }
    )
    await scenario.then(
      'photographs the home page',
      'capturesTheScreen',
      { description: 'App home' },
      { virtualUser: virtualUsers.guest }
    )

    await scenario.when(
      'opens the pricing page',
      'clicksTestId',
      { testId: 'nav-pricing' },
      { virtualUser: virtualUsers.guest }
    )
    await scenario.then(
      'photographs the pricing page',
      'capturesTheScreen',
      { description: 'Pricing page' },
      { virtualUser: virtualUsers.guest }
    )

    return { captures: 2 }
  },
})

export const capturesFeature = pikkuFeature({
  name: 'Run Captures',
  description:
    'A scenario run can photograph the pages it visits, and does not depend on being asked to',
  tags: ['captures', 'browser'],
  scenarios: [captureScenario],
})
