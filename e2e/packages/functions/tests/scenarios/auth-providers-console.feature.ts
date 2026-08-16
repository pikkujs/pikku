/**
 * The console's Auth Providers page.
 *
 * The page is a catalogue of every sign-in method the console knows about,
 * marked against what this project actually has wired. Provider ids (`github`,
 * `google`, `credentials`) and plugin ids (`bearer`) are declared in code, so
 * they are safe to select on; the badge copy beside them is translated and is
 * never read back. "Not configured" is therefore asserted as
 * `data-configured="false"` rather than as the absence of a badge — an absent
 * element would also pass if the row never rendered at all.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const AUTH_PROVIDERS_PAGE = '/console/auth-providers'
const PROVIDERS_READY = { testId: 'auth-provider-row' }

const providerStatus = (id: string, configured: boolean) => ({
  testId: 'auth-provider-status',
  where: { 'data-provider': id, 'data-configured': String(configured) },
})

export const authProvidersConfiguredScenario = pikkuScenario<
  void,
  { configured: true }
>({
  title: 'A wired OAuth provider is marked configured',
  description:
    'GitHub has its secrets in the environment, so the catalogue marks it as configured',
  tags: ['scenario', 'auth-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'authProvidersConfiguredScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the auth providers page',
      'opensConsolePage',
      { path: AUTH_PROVIDERS_PAGE, waitFor: PROVIDERS_READY },
      { actor: actors.admin }
    )
    await scenario.then(
      'finds GitHub in the catalogue',
      'seesTestId',
      { testId: 'auth-provider-row', where: { 'data-provider': 'github' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees GitHub marked configured',
      'seesTestId',
      providerStatus('github', true),
      { actor: actors.admin }
    )

    return { configured: true }
  },
})

export const authProvidersCredentialsConfiguredScenario = pikkuScenario<
  void,
  { configured: true }
>({
  title: 'Email and password sign-in is listed as configured',
  description:
    'The credentials provider is not an OAuth callback, so it is marked from the project having email/password enabled at all',
  tags: ['scenario', 'auth-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'authProvidersCredentialsConfiguredScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the auth providers page',
      'opensConsolePage',
      { path: AUTH_PROVIDERS_PAGE, waitFor: PROVIDERS_READY },
      { actor: actors.admin }
    )
    await scenario.then(
      'finds the credentials provider in the catalogue',
      'seesTestId',
      {
        testId: 'auth-provider-row',
        where: { 'data-provider': 'credentials' },
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees it marked configured',
      'seesTestId',
      providerStatus('credentials', true),
      { actor: actors.admin }
    )

    return { configured: true }
  },
})

export const authProvidersUnconfiguredScenario = pikkuScenario<
  void,
  { unconfigured: true }
>({
  title: 'A provider with no secrets is listed but not marked configured',
  description:
    'The catalogue shows every provider the console could wire, so an unwired one has to be visible and honestly unconfigured',
  tags: ['scenario', 'auth-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'authProvidersUnconfiguredScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the auth providers page',
      'opensConsolePage',
      { path: AUTH_PROVIDERS_PAGE, waitFor: PROVIDERS_READY },
      { actor: actors.admin }
    )
    await scenario.then(
      'finds Google in the catalogue',
      'seesTestId',
      { testId: 'auth-provider-row', where: { 'data-provider': 'google' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees Google reported as not configured',
      'seesTestId',
      providerStatus('google', false),
      { actor: actors.admin }
    )

    return { unconfigured: true }
  },
})

export const authProvidersPluginEnabledScenario = pikkuScenario<
  void,
  { enabled: true }
>({
  title: 'An enabled better-auth plugin is listed alongside the providers',
  description:
    'Plugins change how a session is presented rather than who signs in, so they are shown as their own row of badges',
  tags: ['scenario', 'auth-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'authProvidersPluginEnabledScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the auth providers page',
      'opensConsolePage',
      { path: AUTH_PROVIDERS_PAGE, waitFor: PROVIDERS_READY },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the bearer plugin listed as enabled',
      'seesTestId',
      { testId: 'auth-plugin-bearer' },
      { actor: actors.admin }
    )

    return { enabled: true }
  },
})

export const authProvidersConsoleFeature = pikkuFeature({
  name: 'Auth Providers Console',
  description: 'The catalogue of sign-in methods and what this project wires',
  tags: ['auth-console', 'console'],
  scenarios: [
    authProvidersConfiguredScenario,
    authProvidersCredentialsConfiguredScenario,
    authProvidersUnconfiguredScenario,
    authProvidersPluginEnabledScenario,
  ],
})
