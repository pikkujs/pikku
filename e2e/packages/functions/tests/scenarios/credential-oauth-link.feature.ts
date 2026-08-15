/**
 * Per-user OAuth2 credentials via Better Auth account linking.
 *
 * A `defineCredential({ type: 'wire', oauth2 })` is registered as a Better Auth
 * genericOAuth provider whose providerId is the credential name, so linking an
 * account is what makes `credentialService.get(name, userId)` resolve — no
 * parallel token store, and the token is refreshed on read.
 *
 * The mock provider these link against is started by the server's own
 * `afterStart` lifecycle, so no scenario has to arrange for it.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const PROVIDER = 'user-oauth'
const SINGLETON = 'mock-oauth'

export const oauthLinkResolvesScenario = pikkuScenario<void, { linked: true }>({
  title: 'Linking an account makes the credential resolve',
  description: 'Nothing resolves before the link and everything after it',
  tags: ['scenario', 'credential-oauth-link'],
  func: async (_services, _data, { scenario }) => {
    const user = await scenario.given('signs alice up', 'signsUpLinkUser', {
      name: 'alice',
    })
    const before = await scenario.then(
      'reads her linked providers',
      'readsLinkedProviders',
      { user }
    )
    await scenario.then('expects nothing linked', 'expectsLinkedProviders', {
      linked: before,
      excludes: PROVIDER,
    })
    const unresolved = await scenario.then(
      'reads the credential',
      'readsCredential',
      { name: PROVIDER, userId: user.userId }
    )
    await scenario.then('expects it unresolved', 'expectsCredential', {
      credential: unresolved,
      exists: false,
    })
    await scenario.when('links the provider', 'linksProvider', {
      user,
      providerId: PROVIDER,
    })
    const after = await scenario.then(
      'reads her linked providers again',
      'readsLinkedProviders',
      { user }
    )
    await scenario.then('expects it linked', 'expectsLinkedProviders', {
      linked: after,
      contains: PROVIDER,
    })
    const resolved = await scenario.then(
      'reads the credential again',
      'readsCredential',
      { name: PROVIDER, userId: user.userId }
    )
    await scenario.then('expects it resolved', 'expectsCredential', {
      credential: resolved,
      exists: true,
    })
    return { linked: true }
  },
})

export const oauthLinkRedirectScenario = pikkuScenario<
  void,
  { redirected: true }
>({
  title: "The link redirect targets the provider's declared authorize endpoint",
  description: 'The redirect goes to the declared endpoint with its scopes',
  tags: ['scenario', 'credential-oauth-link'],
  func: async (_services, _data, { scenario }) => {
    const user = await scenario.given('signs a user up', 'signsUpLinkUser', {
      name: 'redirect-user',
    })
    const start = await scenario.when('starts the link', 'startsProviderLink', {
      user,
      providerId: PROVIDER,
    })
    await scenario.then('expects the redirect', 'expectsLinkStart', {
      start,
      status: 200,
      urlContains: '/authorize',
      scopes: ['read', 'write'],
    })
    return { redirected: true }
  },
})

export const oauthUnlinkRevokesScenario = pikkuScenario<
  void,
  { revoked: true }
>({
  title: 'Unlinking revokes access to the credential',
  description: 'The credential stops resolving once the account is unlinked',
  tags: ['scenario', 'credential-oauth-link'],
  func: async (_services, _data, { scenario }) => {
    const user = await scenario.given('signs bob up', 'signsUpLinkUser', {
      name: 'bob',
    })
    await scenario.when('links the provider', 'linksProvider', {
      user,
      providerId: PROVIDER,
    })
    const resolved = await scenario.then(
      'reads the credential',
      'readsCredential',
      { name: PROVIDER, userId: user.userId }
    )
    await scenario.then('expects it resolved', 'expectsCredential', {
      credential: resolved,
      exists: true,
    })
    await scenario.when('unlinks the provider', 'unlinksProvider', {
      user,
      providerId: PROVIDER,
    })
    const linked = await scenario.then(
      'reads his linked providers',
      'readsLinkedProviders',
      { user }
    )
    await scenario.then('expects nothing linked', 'expectsLinkedProviders', {
      linked,
      excludes: PROVIDER,
    })
    const unresolved = await scenario.then(
      'reads the credential again',
      'readsCredential',
      { name: PROVIDER, userId: user.userId }
    )
    await scenario.then('expects it unresolved', 'expectsCredential', {
      credential: unresolved,
      exists: false,
    })
    return { revoked: true }
  },
})

export const oauthLinkIsolationScenario = pikkuScenario<
  void,
  { isolated: true }
>({
  title: 'Linked accounts are isolated per user',
  description: "One user's link does not resolve for anybody else",
  tags: ['scenario', 'credential-oauth-link'],
  func: async (_services, _data, { scenario }) => {
    const carol = await scenario.given('signs carol up', 'signsUpLinkUser', {
      name: 'carol',
    })
    await scenario.when('links carol', 'linksProvider', {
      user: carol,
      providerId: PROVIDER,
    })
    const carolCredential = await scenario.then(
      "reads carol's credential",
      'readsCredential',
      { name: PROVIDER, userId: carol.userId }
    )
    await scenario.then("expects carol's resolved", 'expectsCredential', {
      credential: carolCredential,
      exists: true,
    })
    const dave = await scenario.given('signs dave up', 'signsUpLinkUser', {
      name: 'dave',
    })
    const daveLinked = await scenario.then(
      "reads dave's linked providers",
      'readsLinkedProviders',
      { user: dave }
    )
    await scenario.then('expects dave unlinked', 'expectsLinkedProviders', {
      linked: daveLinked,
      excludes: PROVIDER,
    })
    const daveCredential = await scenario.then(
      "reads dave's credential",
      'readsCredential',
      { name: PROVIDER, userId: dave.userId }
    )
    await scenario.then("expects dave's unresolved", 'expectsCredential', {
      credential: daveCredential,
      exists: false,
    })
    const carolAgain = await scenario.then(
      "reads carol's credential again",
      'readsCredential',
      { name: PROVIDER, userId: carol.userId }
    )
    await scenario.then("expects carol's still resolved", 'expectsCredential', {
      credential: carolAgain,
      exists: true,
    })
    return { isolated: true }
  },
})

/**
 * The custom flow had no refresh at all; delegating to better-auth is the whole
 * point of #844, so pin that the token really came from the exchange — the mock
 * provider mints `mock-access-token`, and anything else means it came from
 * somewhere other than the provider.
 */
export const oauthLiveTokenScenario = pikkuScenario<void, { live: true }>({
  title: 'A linked credential resolves a live access token',
  description: 'The resolved value carries the token the provider minted',
  tags: ['scenario', 'credential-oauth-link'],
  func: async (_services, _data, { scenario }) => {
    const user = await scenario.given('signs erin up', 'signsUpLinkUser', {
      name: 'erin',
    })
    await scenario.when('links the provider', 'linksProvider', {
      user,
      providerId: PROVIDER,
    })
    const credential = await scenario.then(
      'reads the credential',
      'readsCredential',
      { name: PROVIDER, userId: user.userId }
    )
    await scenario.then('expects it resolved', 'expectsCredential', {
      credential,
      exists: true,
    })
    await scenario.then(
      "expects the provider's token",
      'expectsCredentialToken',
      { credential, contains: 'mock' }
    )
    return { live: true }
  },
})

/**
 * A `type: 'singleton'` credential is the platform's, not the connector's: an
 * admin connects it once and it resolves for everyone, with no userId.
 */
export const oauthSingletonLinkScenario = pikkuScenario<
  void,
  { connected: true }
>({
  title: 'An admin connects a platform-wide credential once for everyone',
  description: 'The platform credential resolves for a user who never linked',
  tags: ['scenario', 'credential-oauth-link'],
  func: async (_services, _data, { scenario }) => {
    const root = await scenario.given('signs root up', 'signsUpLinkUser', {
      name: 'root',
    })
    const frank = await scenario.given('signs frank up', 'signsUpLinkUser', {
      name: 'frank',
    })
    await scenario.when('root links the singleton', 'linksProvider', {
      user: root,
      providerId: SINGLETON,
    })
    const platform = await scenario.then(
      'reads the platform credential',
      'readsCredential',
      { name: SINGLETON }
    )
    await scenario.then('expects it resolved', 'expectsCredential', {
      credential: platform,
      exists: true,
    })
    const forFrank = await scenario.then(
      "reads it as frank's",
      'readsCredential',
      { name: SINGLETON, userId: frank.userId }
    )
    await scenario.then('expects it resolved for frank', 'expectsCredential', {
      credential: forFrank,
      exists: true,
    })
    return { connected: true }
  },
})

/**
 * better-auth's own unlink acts on the caller's session, so it cannot express
 * "revoke this for that user" — the path an admin console takes. It has to go
 * through credentialService.delete, which is what this pins.
 */
export const oauthServerSideRevokeScenario = pikkuScenario<
  void,
  { revoked: true }
>({
  title: "A credential can be revoked server-side without the user's session",
  description: 'A revoke with no session anywhere unlinks the account too',
  tags: ['scenario', 'credential-oauth-link'],
  func: async (_services, _data, { scenario }) => {
    const user = await scenario.given('signs grace up', 'signsUpLinkUser', {
      name: 'grace',
    })
    await scenario.when('links the provider', 'linksProvider', {
      user,
      providerId: PROVIDER,
    })
    const resolved = await scenario.then(
      'reads the credential',
      'readsCredential',
      { name: PROVIDER, userId: user.userId }
    )
    await scenario.then('expects it resolved', 'expectsCredential', {
      credential: resolved,
      exists: true,
    })
    await scenario.when('revokes it server-side', 'deletesCredential', {
      name: PROVIDER,
      userId: user.userId,
    })
    const unresolved = await scenario.then(
      'reads the credential again',
      'readsCredential',
      { name: PROVIDER, userId: user.userId }
    )
    await scenario.then('expects it unresolved', 'expectsCredential', {
      credential: unresolved,
      exists: false,
    })
    const linked = await scenario.then(
      'reads her linked providers',
      'readsLinkedProviders',
      { user }
    )
    await scenario.then('expects nothing linked', 'expectsLinkedProviders', {
      linked,
      excludes: PROVIDER,
    })
    return { revoked: true }
  },
})

/**
 * The platform user has no sign-in method and never holds a session, so a
 * server-side revoke is the ONLY way a singleton can ever be disconnected.
 */
export const oauthSingletonRevokeScenario = pikkuScenario<
  void,
  { disconnected: true }
>({
  title: 'A platform-wide credential can be disconnected',
  description: 'The platform credential stops resolving after a revoke',
  tags: ['scenario', 'credential-oauth-link'],
  func: async (_services, _data, { scenario }) => {
    const root = await scenario.given('signs root up', 'signsUpLinkUser', {
      name: 'root',
    })
    await scenario.when('root links the singleton', 'linksProvider', {
      user: root,
      providerId: SINGLETON,
    })
    const resolved = await scenario.then(
      'reads the platform credential',
      'readsCredential',
      { name: SINGLETON }
    )
    await scenario.then('expects it resolved', 'expectsCredential', {
      credential: resolved,
      exists: true,
    })
    await scenario.when('revokes it server-side', 'deletesCredential', {
      name: SINGLETON,
    })
    const unresolved = await scenario.then(
      'reads the platform credential again',
      'readsCredential',
      { name: SINGLETON }
    )
    await scenario.then('expects it unresolved', 'expectsCredential', {
      credential: unresolved,
      exists: false,
    })
    return { disconnected: true }
  },
})

/** Revoking is idempotent: a retried disconnect must not turn into an error. */
export const oauthRevokeUnlinkedScenario = pikkuScenario<
  void,
  { revoked: true }
>({
  title: 'Revoking an unlinked credential succeeds',
  description: 'Revoking something never linked is accepted, not an error',
  tags: ['scenario', 'credential-oauth-link'],
  func: async (_services, _data, { scenario }) => {
    const user = await scenario.given('signs heidi up', 'signsUpLinkUser', {
      name: 'heidi',
    })
    await scenario.when('revokes it server-side', 'deletesCredential', {
      name: PROVIDER,
      userId: user.userId,
    })
    const credential = await scenario.then(
      'reads the credential',
      'readsCredential',
      { name: PROVIDER, userId: user.userId }
    )
    await scenario.then('expects it unresolved', 'expectsCredential', {
      credential,
      exists: false,
    })
    return { revoked: true }
  },
})

/**
 * Connecting a singleton rebinds the token for every user, so it cannot be left
 * to any signed-in caller. The 403 is the whole assertion: it is refused before
 * any state is generated, so nothing can be written. Asserting the credential
 * stays unresolved would instead assert global state that the scenario above
 * owns.
 */
export const oauthSingletonForbiddenScenario = pikkuScenario<
  void,
  { forbidden: true }
>({
  title: 'A non-admin cannot connect a platform-wide credential',
  description: 'The link is refused before any state is generated',
  tags: ['scenario', 'credential-oauth-link'],
  func: async (_services, _data, { scenario }) => {
    const user = await scenario.given('signs mallory up', 'signsUpLinkUser', {
      name: 'mallory',
    })
    const start = await scenario.when(
      'tries to link the singleton',
      'startsProviderLink',
      { user, providerId: SINGLETON }
    )
    await scenario.then('expects a refusal', 'expectsLinkStart', {
      start,
      status: 403,
    })
    return { forbidden: true }
  },
})

export const credentialOAuthLinkFeature = pikkuFeature({
  name: 'Per-user OAuth2 credentials via Better Auth account linking',
  description:
    'Linking, unlinking, isolation, live tokens and server-side revocation',
  tags: ['credential-oauth-link'],
  scenarios: [
    oauthLinkResolvesScenario,
    oauthLinkRedirectScenario,
    oauthUnlinkRevokesScenario,
    oauthLinkIsolationScenario,
    oauthLiveTokenScenario,
    oauthSingletonLinkScenario,
    oauthServerSideRevokeScenario,
    oauthSingletonRevokeScenario,
    oauthRevokeUnlinkedScenario,
    oauthSingletonForbiddenScenario,
  ],
})
