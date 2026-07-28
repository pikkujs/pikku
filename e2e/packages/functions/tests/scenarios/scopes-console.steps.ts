/**
 * The one step the Scopes feature needs beyond the generic browser verbs: the
 * roles drawer is opened from the Users page, so reaching it is a page-specific
 * navigation rather than a click on the surface under test.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import type {} from '@pikku/playwright'

export const opensUserRolesDrawer = pikkuScenarioStep<
  { email: string },
  { opened: string },
  true
>({
  name: 'opensUserRolesDrawer',
  description: 'opens the roles drawer for one user from the users directory',
  template: 'opens the roles drawer for {email}',
  browser: true,
  func: async (_services, { email }, { browser }) => {
    await browser.goto('/console/users')
    await browser
      .locate({ testId: 'user-row' })
      .first()
      .waitFor({ state: 'visible' })
    await browser
      .locate({
        testId: 'user-roles',
        within: { testId: 'user-row', containing: email },
      })
      .first()
      .click()
    await browser
      .locate({ testId: 'user-roles-drawer' })
      .first()
      .waitFor({ state: 'visible' })
    return { opened: email }
  },
})
