/**
 * Photograph this app's pages as a signed-in person sees them.
 *
 * Each page is captured at three widths: desktop, tablet portrait and phone.
 * 768 earns its place: a sweep of 1280 and 375 passed both while the tablet
 * breakpoint sliced "Out of service" mid-word, because the widths between two
 * samples are not interpolation — they are where the column-count breakpoints
 * actually fire. The list is flat rather than a nested loop over viewports because pikku
 * extracts a scenario's steps from the AST — a nested loop makes the scenario
 * unextractable and it silently runs as an empty one (PKU679).
 *
 * Every capture returns the page's console errors, page errors and failed
 * requests alongside the file, because a screenshot on its own is a picture of
 * a page that may be quietly broken — a failed API call renders as an empty
 * list, which photographs as a design decision.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

const CAPTURES = [
  { path: '/app', name: 'home', width: 1280, height: 720, scheme: 'light' },
  { path: '/app', name: 'home-dark', width: 1280, height: 720, scheme: 'dark' },
  {
    path: '/app',
    name: 'home-switch',
    width: 992,
    height: 900,
    scheme: 'light',
  },
  {
    path: '/app',
    name: 'home-tablet',
    width: 768,
    height: 1024,
    scheme: 'light',
  },
  {
    path: '/app',
    name: 'home-mobile',
    width: 375,
    height: 812,
    scheme: 'light',
  },
  {
    path: '/app/catalogue',
    name: 'catalogue',
    width: 1280,
    height: 720,
    scheme: 'light',
  },
  {
    path: '/app/catalogue',
    name: 'catalogue-dark',
    width: 1280,
    height: 720,
    scheme: 'dark',
  },
  {
    path: '/app/catalogue',
    name: 'catalogue-switch',
    width: 992,
    height: 900,
    scheme: 'light',
  },
  {
    path: '/app/catalogue',
    name: 'catalogue-tablet',
    width: 768,
    height: 1024,
    scheme: 'light',
  },
  {
    path: '/app/catalogue',
    name: 'catalogue-mobile',
    width: 375,
    height: 812,
    scheme: 'light',
  },
  {
    path: '/app/account',
    name: 'account',
    width: 1280,
    height: 720,
    scheme: 'light',
  },
  {
    path: '/app/account',
    name: 'account-dark',
    width: 1280,
    height: 720,
    scheme: 'dark',
  },
  {
    path: '/app/account',
    name: 'account-switch',
    width: 992,
    height: 900,
    scheme: 'light',
  },
  {
    path: '/app/account',
    name: 'account-tablet',
    width: 768,
    height: 1024,
    scheme: 'light',
  },
  {
    path: '/app/account',
    name: 'account-mobile',
    width: 375,
    height: 812,
    scheme: 'light',
  },
  {
    path: '/app/basket',
    name: 'basket',
    width: 1280,
    height: 720,
    scheme: 'light',
  },
  {
    path: '/app/basket',
    name: 'basket-dark',
    width: 1280,
    height: 720,
    scheme: 'dark',
  },
  {
    path: '/app/basket',
    name: 'basket-switch',
    width: 992,
    height: 900,
    scheme: 'light',
  },
  {
    path: '/app/basket',
    name: 'basket-tablet',
    width: 768,
    height: 1024,
    scheme: 'light',
  },
  {
    path: '/app/basket',
    name: 'basket-mobile',
    width: 375,
    height: 812,
    scheme: 'light',
  },
  {
    path: '/app/orders',
    name: 'orders',
    width: 1280,
    height: 720,
    scheme: 'light',
  },
  {
    path: '/app/orders',
    name: 'orders-dark',
    width: 1280,
    height: 720,
    scheme: 'dark',
  },
  {
    path: '/app/orders',
    name: 'orders-switch',
    width: 992,
    height: 900,
    scheme: 'light',
  },
  {
    path: '/app/orders',
    name: 'orders-tablet',
    width: 768,
    height: 1024,
    scheme: 'light',
  },
  {
    path: '/app/orders',
    name: 'orders-mobile',
    width: 375,
    height: 812,
    scheme: 'light',
  },
] as const

export const capturesEveryPageScenario = pikkuScenario<
  void,
  { files: string[]; clean: boolean }
>({
  title: 'Capture every page for review',
  description:
    'Screenshots the app as a signed-in user, at desktop and phone widths',
  tags: ['scenario', 'screenshots'],
  func: async ({ logger }, _data, { scenario, actors }) => {
    if (!actors?.visitor) {
      throw new Error(
        'needs the `visitor` actor — run via `pikku scenario run <environment>`'
      )
    }

    const files: string[] = []
    let clean = true

    for (const capture of CAPTURES) {
      const shot = await scenario.then(
        `captures ${capture.name}`,
        'capturesPage',
        {
          path: capture.path,
          name: capture.name,
          outDir: 'screenshots',
          width: capture.width,
          height: capture.height,
          scheme: capture.scheme,
        },
        { actor: actors.visitor }
      )
      files.push(shot.file)
      const problems = [
        ...shot.consoleErrors,
        ...shot.pageErrors,
        ...shot.failedRequests,
        ...shot.apiErrors,
      ]
      if (problems.length > 0) {
        clean = false
        logger.warn({
          event: 'page_issues',
          path: capture.path,
          width: capture.width,
          problems,
        })
      }
    }

    return { files, clean }
  },
})

export const screenshotsFeature = pikkuFeature({
  name: 'Screenshots',
  description: 'Capture every page for visual review at both widths',
  tags: ['screenshots'],
  scenarios: [capturesEveryPageScenario],
})
