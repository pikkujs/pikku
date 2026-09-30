/**
 * The console emails page: the template gallery and one template's detail view.
 *
 * The template names and locale counts asserted here come from the project's
 * own email templates, so they are a statement about this e2e app rather than
 * about the console's copy.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const EMAILS_PAGE = '/console/emails'
const TEMPLATE = 'hello-world'

export const emailTemplateGridScenario = pikkuScenario<void, { listed: true }>({
  title: 'The emails page renders the template grid',
  description: 'An admin opens the emails page and finds the app’s templates',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'emailTemplateGridScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the emails page',
      'opensConsolePage',
      { path: EMAILS_PAGE, waitFor: { testId: 'emails-hero' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the hello-world template',
      'seesTestId',
      { testId: `email-row-${TEMPLATE}` },
      { actor: actors.admin }
    )

    return { listed: true }
  },
})

export const emailTemplateLocalesScenario = pikkuScenario<
  void,
  { counted: true }
>({
  title: 'An email template previews in each of its locales',
  description:
    'The hello-world template is translated twice and the preview offers both',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'emailTemplateLocalesScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the emails page',
      'opensConsolePage',
      { path: EMAILS_PAGE, waitFor: { testId: 'emails-hero' } },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the hello-world template',
      'clicksTestId',
      { testId: `email-row-${TEMPLATE}` },
      { actor: actors.admin }
    )
    await scenario.then(
      'previews it in English',
      'selectsSegment',
      { value: 'en' },
      { actor: actors.admin }
    )
    await scenario.then(
      'previews it in German',
      'selectsSegment',
      { value: 'de' },
      { actor: actors.admin }
    )

    return { counted: true }
  },
})

export const emailTemplateDetailScenario = pikkuScenario<
  void,
  { opened: true }
>({
  title: 'Clicking an email template opens its detail view',
  description: 'The detail view renders a preview of the template',
  tags: ['scenario', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'emailTemplateDetailScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the emails page',
      'opensConsolePage',
      { path: EMAILS_PAGE },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the hello-world template',
      'clicksTestId',
      { testId: `email-row-${TEMPLATE}` },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the template',
      'seesTestId',
      { testId: 'emails-detail-hero' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the rendered preview',
      'seesTestId',
      { testId: 'emails-preview-frame' },
      { actor: actors.admin }
    )

    return { opened: true }
  },
})

export const emailsConsoleFeature = pikkuFeature({
  name: 'Emails Console Page',
  description:
    'The console lists the project’s email templates and renders one',
  tags: ['emails-console', 'console'],
  scenarios: [
    emailTemplateGridScenario,
    emailTemplateLocalesScenario,
    emailTemplateDetailScenario,
  ],
})
