/**
 * The credential service API: CRUD, per-user isolation, the HMAC addon that
 * consumes a wire credential explicitly, the lazy loading an authenticated
 * principal gets for free, and the OAuth addon that gates on a linked account.
 *
 * Every scenario opens by resetting the credentials — the runner is serial with
 * no state reset, and these scenarios reuse credential names on purpose.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

const HMAC = 'hmac-key'
const PROVIDER = 'user-oauth'

export const credentialSetAndGetScenario = pikkuScenario<void, { set: true }>({
  title: 'Set and get a global credential',
  description: 'A stored credential reads back with the value it was given',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.when('stores stripe', 'setsCredential', {
      name: 'stripe',
      value: { apiKey: 'sk_test_123' },
    })
    const credential = await scenario.when('reads stripe', 'readsCredential', {
      name: 'stripe',
    })
    await scenario.then('expects the value', 'expectsCredential', {
      credential,
      exists: true,
      value: { apiKey: 'sk_test_123' },
    })
    return { set: true }
  },
})

export const credentialMissingScenario = pikkuScenario<void, { missing: true }>(
  {
    title: 'Get missing credential returns null',
    description: 'A credential nobody stored resolves to nothing',
    tags: ['scenario', 'credential'],
    func: async (_services, _data, { scenario }) => {
      await scenario.given(
        'resets the credentials',
        'resetsCredentials',
        undefined
      )
      const credential = await scenario.when(
        'reads a credential nobody stored',
        'readsCredential',
        { name: 'nonexistent' }
      )
      await scenario.then('expects nothing', 'expectsCredential', {
        credential,
        exists: false,
        value: null,
      })
      return { missing: true }
    },
  }
)

export const credentialDeleteScenario = pikkuScenario<void, { deleted: true }>({
  title: 'Delete a credential',
  description: 'A deleted credential stops resolving',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.given('stores temp', 'setsCredential', {
      name: 'temp',
      value: { token: 'abc' },
    })
    const stored = await scenario.then('reads temp', 'readsCredential', {
      name: 'temp',
    })
    await scenario.then('expects it to exist', 'expectsCredential', {
      credential: stored,
      exists: true,
    })
    await scenario.when('deletes temp', 'deletesCredential', { name: 'temp' })
    const deleted = await scenario.then('reads temp again', 'readsCredential', {
      name: 'temp',
    })
    await scenario.then('expects it gone', 'expectsCredential', {
      credential: deleted,
      exists: false,
    })
    return { deleted: true }
  },
})

export const credentialOverwriteScenario = pikkuScenario<
  void,
  { overwritten: true }
>({
  title: 'Overwrite an existing credential',
  description: 'The second write wins',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.given('stores the old value', 'setsCredential', {
      name: 'api',
      value: { key: 'old' },
    })
    await scenario.when('stores the new value', 'setsCredential', {
      name: 'api',
      value: { key: 'new' },
    })
    const credential = await scenario.then('reads api', 'readsCredential', {
      name: 'api',
    })
    await scenario.then('expects the new value', 'expectsCredential', {
      credential,
      value: { key: 'new' },
    })
    return { overwritten: true }
  },
})

export const credentialPerUserIsolationScenario = pikkuScenario<
  void,
  { isolated: true }
>({
  title: 'Per-user credential isolation',
  description: 'Two users hold different values under the same name',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.when("stores user-1's google", 'setsCredential', {
      name: 'google',
      value: { accessToken: 'token-1' },
      userId: 'user-1',
    })
    await scenario.when("stores user-2's google", 'setsCredential', {
      name: 'google',
      value: { accessToken: 'token-2' },
      userId: 'user-2',
    })
    const first = await scenario.then("reads user-1's", 'readsCredential', {
      name: 'google',
      userId: 'user-1',
    })
    await scenario.then("expects user-1's value", 'expectsCredential', {
      credential: first,
      value: { accessToken: 'token-1' },
    })
    const second = await scenario.then("reads user-2's", 'readsCredential', {
      name: 'google',
      userId: 'user-2',
    })
    await scenario.then("expects user-2's value", 'expectsCredential', {
      credential: second,
      value: { accessToken: 'token-2' },
    })
    const global = await scenario.then('reads the global', 'readsCredential', {
      name: 'google',
    })
    await scenario.then('expects no global value', 'expectsCredential', {
      credential: global,
      exists: false,
    })
    return { isolated: true }
  },
})

export const credentialPerUserDeleteScenario = pikkuScenario<
  void,
  { deleted: true }
>({
  title: 'Per-user delete does not affect other users',
  description: "Deleting one user's credential leaves the other's alone",
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.given("stores user-a's slack", 'setsCredential', {
      name: 'slack',
      value: { token: 'a' },
      userId: 'user-a',
    })
    await scenario.given("stores user-b's slack", 'setsCredential', {
      name: 'slack',
      value: { token: 'b' },
      userId: 'user-b',
    })
    await scenario.when("deletes user-a's slack", 'deletesCredential', {
      name: 'slack',
      userId: 'user-a',
    })
    const gone = await scenario.then("reads user-a's", 'readsCredential', {
      name: 'slack',
      userId: 'user-a',
    })
    await scenario.then("expects user-a's gone", 'expectsCredential', {
      credential: gone,
      exists: false,
    })
    const kept = await scenario.then("reads user-b's", 'readsCredential', {
      name: 'slack',
      userId: 'user-b',
    })
    await scenario.then("expects user-b's kept", 'expectsCredential', {
      credential: kept,
      exists: true,
    })
    return { deleted: true }
  },
})

export const credentialGlobalVsPerUserScenario = pikkuScenario<
  void,
  { independent: true }
>({
  title: 'Global vs per-user credentials are independent',
  description: 'The same name holds a different value at each level',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.when('stores the global github', 'setsCredential', {
      name: 'github',
      value: { token: 'global' },
    })
    await scenario.when("stores user-1's github", 'setsCredential', {
      name: 'github',
      value: { token: 'per-user' },
      userId: 'user-1',
    })
    const global = await scenario.then('reads the global', 'readsCredential', {
      name: 'github',
    })
    await scenario.then('expects the global value', 'expectsCredential', {
      credential: global,
      value: { token: 'global' },
    })
    const perUser = await scenario.then("reads user-1's", 'readsCredential', {
      name: 'github',
      userId: 'user-1',
    })
    await scenario.then("expects user-1's value", 'expectsCredential', {
      credential: perUser,
      value: { token: 'per-user' },
    })
    return { independent: true }
  },
})

export const credentialListForUserScenario = pikkuScenario<
  void,
  { listed: true }
>({
  title: 'Get all credentials for a user',
  description: 'Every credential a user owns comes back in one read',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.given("stores user-x's stripe", 'setsCredential', {
      name: 'stripe',
      value: { apiKey: 'sk_123' },
      userId: 'user-x',
    })
    await scenario.given("stores user-x's google", 'setsCredential', {
      name: 'google',
      value: { accessToken: 'ya29' },
      userId: 'user-x',
    })
    const all = await scenario.when(
      "reads user-x's credentials",
      'readsAllCredentials',
      { userId: 'user-x' }
    )
    await scenario.then('expects both of them', 'expectsCredentials', {
      all,
      count: 2,
      values: {
        stripe: { apiKey: 'sk_123' },
        google: { accessToken: 'ya29' },
      },
    })
    return { listed: true }
  },
})

export const credentialListEmptyScenario = pikkuScenario<void, { empty: true }>(
  {
    title: 'Get all credentials for user with none returns empty',
    description: 'A user who owns nothing reads back an empty set',
    tags: ['scenario', 'credential'],
    func: async (_services, _data, { scenario }) => {
      await scenario.given(
        'resets the credentials',
        'resetsCredentials',
        undefined
      )
      const all = await scenario.when(
        "reads an empty user's credentials",
        'readsAllCredentials',
        { userId: 'empty-user' }
      )
      await scenario.then('expects none', 'expectsCredentials', {
        all,
        count: 0,
      })
      return { empty: true }
    },
  }
)

export const credentialHmacRoundTripScenario = pikkuScenario<
  void,
  { verified: true }
>({
  title: 'HMAC sign and verify with wire credential',
  description: 'A signature made with the wire credential verifies against it',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.given('stores the hmac key', 'setsCredential', {
      name: HMAC,
      value: { secretKey: 'my-secret-key-123' },
    })
    const signed = await scenario.when('signs a message', 'signsMessage', {
      message: 'hello world',
      credential: HMAC,
    })
    await scenario.then('expects a signature', 'expectsSignature', {
      signed,
      accepted: true,
    })
    const verification = await scenario.when(
      'verifies the signature',
      'verifiesMessage',
      { message: 'hello world', signature: signed.signature!, credential: HMAC }
    )
    await scenario.then('expects it valid', 'expectsVerification', {
      verification,
      valid: true,
    })
    return { verified: true }
  },
})

export const credentialHmacWrongSignatureScenario = pikkuScenario<
  void,
  { rejected: true }
>({
  title: 'HMAC verify rejects wrong signature',
  description: 'A signature the key did not produce does not verify',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.given('stores the hmac key', 'setsCredential', {
      name: HMAC,
      value: { secretKey: 'my-secret-key-123' },
    })
    const verification = await scenario.when(
      'verifies a forged signature',
      'verifiesMessage',
      { message: 'hello world', signature: 'wrong-sig', credential: HMAC }
    )
    await scenario.then('expects it invalid', 'expectsVerification', {
      verification,
      valid: false,
    })
    return { rejected: true }
  },
})

export const credentialHmacWithoutCredentialScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'HMAC sign fails without credential',
  description: 'Signing with nothing to sign with is refused',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    const signed = await scenario.when(
      'signs with no credential',
      'signsMessage',
      { message: 'hello world' }
    )
    await scenario.then('expects it refused', 'expectsSignature', {
      signed,
      accepted: false,
      error: 'Missing hmac-key credential',
    })
    return { refused: true }
  },
})

export const credentialLazyLoadScenario = pikkuScenario<void, { lazy: true }>({
  title: 'Lazy-load credentials for authenticated user',
  description: "The addon loads the caller's own credential with no header",
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.given("stores lazy-user's key", 'setsCredential', {
      name: HMAC,
      value: { secretKey: 'lazy-secret-123' },
      userId: 'lazy-user',
    })
    const signed = await scenario.when('signs as lazy-user', 'signsMessage', {
      message: 'hello lazy',
      userId: 'lazy-user',
    })
    await scenario.then('expects a signature', 'expectsSignature', {
      signed,
      accepted: true,
    })
    const verification = await scenario.when(
      'verifies as lazy-user',
      'verifiesMessage',
      {
        message: 'hello lazy',
        signature: signed.signature!,
        userId: 'lazy-user',
      }
    )
    await scenario.then('expects it valid', 'expectsVerification', {
      verification,
      valid: true,
    })
    return { lazy: true }
  },
})

export const credentialLazyLoadPerUserScenario = pikkuScenario<
  void,
  { differed: true }
>({
  title: 'Lazy-load returns different credentials per user',
  description: 'Two users signing the same message produce different output',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.given("stores user-a's key", 'setsCredential', {
      name: HMAC,
      value: { secretKey: 'secret-a' },
      userId: 'user-a',
    })
    await scenario.given("stores user-b's key", 'setsCredential', {
      name: HMAC,
      value: { secretKey: 'secret-b' },
      userId: 'user-b',
    })
    const first = await scenario.when('signs as user-a', 'signsMessage', {
      message: 'same message',
      userId: 'user-a',
    })
    const second = await scenario.when('signs as user-b', 'signsMessage', {
      message: 'same message',
      userId: 'user-b',
    })
    await scenario.then('expects them to differ', 'expectsSignature', {
      signed: second,
      accepted: true,
      differsFrom: first,
    })
    return { differed: true }
  },
})

export const credentialLazyLoadMissingScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'Lazy-load fails gracefully without credentials',
  description: 'A principal who owns nothing is refused, not crashed',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    const signed = await scenario.when(
      'signs as a principal with nothing',
      'signsMessage',
      { message: 'hello', userId: 'no-creds-user' }
    )
    await scenario.then('expects it refused', 'expectsSignature', {
      signed,
      accepted: false,
      error: 'Missing hmac-key credential',
    })
    return { refused: true }
  },
})

export const credentialLazyLoadCrossVerifyScenario = pikkuScenario<
  void,
  { rejected: true }
>({
  title: 'Lazy-load cross-verify fails between users',
  description: "One user's signature does not verify under another's key",
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.given("stores user-x's key", 'setsCredential', {
      name: HMAC,
      value: { secretKey: 'secret-x' },
      userId: 'user-x',
    })
    await scenario.given("stores user-y's key", 'setsCredential', {
      name: HMAC,
      value: { secretKey: 'secret-y' },
      userId: 'user-y',
    })
    const signed = await scenario.when('signs as user-x', 'signsMessage', {
      message: 'cross-verify test',
      userId: 'user-x',
    })
    const verification = await scenario.when(
      'verifies as user-y',
      'verifiesMessage',
      {
        message: 'cross-verify test',
        signature: signed.signature!,
        userId: 'user-y',
      }
    )
    await scenario.then('expects it invalid', 'expectsVerification', {
      verification,
      valid: false,
    })
    return { rejected: true }
  },
})

export const credentialOAuthApiRefusedScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'OAuth API returns 403 without credentials',
  description: 'A principal with no linked account cannot reach the profile',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    const profile = await scenario.when(
      'reads the profile with nothing linked',
      'readsOAuthProfile',
      { userId: 'no-creds-user' }
    )
    await scenario.then('expects a refusal', 'expectsOAuthProfile', {
      profile,
      status: 403,
    })
    return { refused: true }
  },
})

export const credentialOAuthApiAllowedScenario = pikkuScenario<
  void,
  { allowed: true }
>({
  title: 'OAuth API returns 200 after OAuth connect',
  description: 'Linking the provider is what opens the profile endpoint',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    const user = await scenario.given('signs a user up', 'signsUpLinkUser', {
      name: 'oauth-alice',
    })
    await scenario.given('links the provider', 'linksProvider', {
      user,
      providerId: PROVIDER,
    })
    const profile = await scenario.when(
      'reads the profile',
      'readsOAuthProfile',
      { userId: user.userId }
    )
    await scenario.then('expects it authenticated', 'expectsOAuthProfile', {
      profile,
      status: 200,
      authenticated: true,
    })
    return { allowed: true }
  },
})

export const credentialOAuthApiIsolationScenario = pikkuScenario<
  void,
  { isolated: true }
>({
  title: 'OAuth API per-user isolation - one connected, one not',
  description: 'Linking opens the endpoint for that user only',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    const connected = await scenario.given(
      'signs the connecting user up',
      'signsUpLinkUser',
      { name: 'connected-user' }
    )
    const disconnected = await scenario.given(
      'signs the other user up',
      'signsUpLinkUser',
      { name: 'disconnected-user' }
    )
    await scenario.given('links the provider', 'linksProvider', {
      user: connected,
      providerId: PROVIDER,
    })
    const allowed = await scenario.when(
      'reads the connected profile',
      'readsOAuthProfile',
      { userId: connected.userId }
    )
    await scenario.then('expects it allowed', 'expectsOAuthProfile', {
      profile: allowed,
      status: 200,
    })
    const refused = await scenario.when(
      'reads the disconnected profile',
      'readsOAuthProfile',
      { userId: disconnected.userId }
    )
    await scenario.then('expects it refused', 'expectsOAuthProfile', {
      profile: refused,
      status: 403,
    })
    return { isolated: true }
  },
})

export const credentialWorkflowScenario = pikkuScenario<
  void,
  { propagated: true }
>({
  title: 'Workflow step accesses user credentials via pikkuUserId',
  description: "A workflow step resolves the running user's own credential",
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    const user = await scenario.given('signs a user up', 'signsUpLinkUser', {
      name: 'wf-user',
    })
    await scenario.given('links the provider', 'linksProvider', {
      user,
      providerId: PROVIDER,
    })
    const run = await scenario.when(
      'runs the credential workflow',
      'runsWorkflow',
      { workflowName: 'credentialWorkflow', userId: user.userId }
    )
    await scenario.then('expects it to complete', 'expectsWorkflowOutcome', {
      run,
      outcome: 'completed',
    })
    await scenario.then(
      'expects an authenticated profile',
      'expectsWorkflowOutput',
      { run, values: { authenticated: true } }
    )
    return { propagated: true }
  },
})

export const credentialWorkflowMissingScenario = pikkuScenario<
  void,
  { failed: true }
>({
  title: 'Workflow step fails without user credentials',
  description: 'A principal with no linked account fails the workflow',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    const run = await scenario.when(
      'runs the credential workflow',
      'runsWorkflow',
      { workflowName: 'credentialWorkflow', userId: 'wf-no-creds' }
    )
    await scenario.then('expects it to fail', 'expectsWorkflowOutcome', {
      run,
      outcome: 'failed',
    })
    return { failed: true }
  },
})

export const credentialDifferentKeysScenario = pikkuScenario<
  void,
  { differed: true }
>({
  title: 'Different signing keys produce different signatures',
  description: 'Replacing the key changes what the same message signs to',
  tags: ['scenario', 'credential'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given(
      'resets the credentials',
      'resetsCredentials',
      undefined
    )
    await scenario.given('stores the alpha key', 'setsCredential', {
      name: HMAC,
      value: { secretKey: 'key-alpha' },
    })
    const alpha = await scenario.when('signs with alpha', 'signsMessage', {
      message: 'test message',
      credential: HMAC,
    })
    await scenario.given(
      'resets the credentials again',
      'resetsCredentials',
      undefined
    )
    await scenario.given('stores the beta key', 'setsCredential', {
      name: HMAC,
      value: { secretKey: 'key-beta' },
    })
    const beta = await scenario.when('signs with beta', 'signsMessage', {
      message: 'test message',
      credential: HMAC,
    })
    await scenario.then('expects them to differ', 'expectsSignature', {
      signed: beta,
      accepted: true,
      differsFrom: alpha,
    })
    return { differed: true }
  },
})

export const credentialApiFeature = pikkuFeature({
  name: 'Credential Service API',
  description:
    'Credential CRUD, per-user isolation, HMAC signing and OAuth gating',
  tags: ['credential'],
  scenarios: [
    credentialSetAndGetScenario,
    credentialMissingScenario,
    credentialDeleteScenario,
    credentialOverwriteScenario,
    credentialPerUserIsolationScenario,
    credentialPerUserDeleteScenario,
    credentialGlobalVsPerUserScenario,
    credentialListForUserScenario,
    credentialListEmptyScenario,
    credentialHmacRoundTripScenario,
    credentialHmacWrongSignatureScenario,
    credentialHmacWithoutCredentialScenario,
    credentialLazyLoadScenario,
    credentialLazyLoadPerUserScenario,
    credentialLazyLoadMissingScenario,
    credentialLazyLoadCrossVerifyScenario,
    credentialOAuthApiRefusedScenario,
    credentialOAuthApiAllowedScenario,
    credentialOAuthApiIsolationScenario,
    credentialWorkflowScenario,
    credentialWorkflowMissingScenario,
    credentialDifferentKeysScenario,
  ],
})
