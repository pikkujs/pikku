/**
 * Better Auth email/password authentication, end to end through the client SDK
 * a frontend would use.
 *
 * Better Auth persists its tables for the server's lifetime and there is no
 * reset, so every scenario signs up its own user under a unique email — the
 * names are the gherkin's and stay distinct on purpose.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

export const authSignUpSucceedsScenario = pikkuScenario<void, { ok: true }>({
  title: 'User signs up successfully',
  description: 'A sign-up is accepted and leaves the user signed in',
  tags: ['scenario', 'auth'],
  func: async (_services, _data, { scenario }) => {
    const attempt = await scenario.when('alice signs up', 'signsUpUser', {
      email: 'alice@example.com',
      password: 'password123',
    })
    await scenario.then('sees alice signed in', 'expectsAuthAttempt', {
      attempt,
      accepted: true,
      sessionEmail: 'alice@example.com',
    })
    return { ok: true }
  },
})

export const authDuplicateSignUpRejectedScenario = pikkuScenario<
  void,
  { rejected: true }
>({
  title: 'Duplicate signup is rejected',
  description: 'The second sign-up under the same email is refused',
  tags: ['scenario', 'auth'],
  func: async (_services, _data, { scenario }) => {
    const first = await scenario.given('bob signs up', 'signsUpUser', {
      email: 'bob@example.com',
      password: 'password123',
    })
    await scenario.then('sees it accepted', 'expectsAuthAttempt', {
      attempt: first,
      accepted: true,
    })
    const second = await scenario.when('bob signs up again', 'signsUpUser', {
      email: 'bob@example.com',
      password: 'password456',
    })
    await scenario.then('sees it refused', 'expectsAuthAttempt', {
      attempt: second,
      accepted: false,
    })
    return { rejected: true }
  },
})

export const authSignInSucceedsScenario = pikkuScenario<void, { ok: true }>({
  title: 'User logs in with valid credentials',
  description: 'A sign-in with the registered password establishes a session',
  tags: ['scenario', 'auth'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given('carol signs up', 'signsUpUser', {
      email: 'carol@example.com',
      password: 'secret99',
    })
    const attempt = await scenario.when(
      'carol signs in',
      'signsInAndReadsSession',
      { email: 'carol@example.com', password: 'secret99' }
    )
    await scenario.then('sees carol signed in', 'expectsAuthAttempt', {
      attempt,
      accepted: true,
      sessionEmail: 'carol@example.com',
    })
    return { ok: true }
  },
})

export const authSignInWrongPasswordScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'Login fails with wrong password',
  description: 'The wrong password establishes no session',
  tags: ['scenario', 'auth'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given('dave signs up', 'signsUpUser', {
      email: 'dave@example.com',
      password: 'correct1',
    })
    const attempt = await scenario.when(
      'dave signs in with the wrong password',
      'signsInAndReadsSession',
      { email: 'dave@example.com', password: 'wrongpass' }
    )
    await scenario.then('sees no session', 'expectsAuthAttempt', {
      attempt,
      accepted: false,
      sessionEmail: null,
    })
    return { refused: true }
  },
})

export const authSignInUnknownUserScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'Login fails for unknown user',
  description: 'An email nobody registered establishes no session',
  tags: ['scenario', 'auth'],
  func: async (_services, _data, { scenario }) => {
    const attempt = await scenario.when(
      'a ghost signs in',
      'signsInAndReadsSession',
      { email: 'ghost@example.com', password: 'anything' }
    )
    await scenario.then('sees no session', 'expectsAuthAttempt', {
      attempt,
      accepted: false,
      sessionEmail: null,
    })
    return { refused: true }
  },
})

export const authSignOutScenario = pikkuScenario<void, { signedOut: true }>({
  title: 'User logs out',
  description: 'Signing out leaves no session behind',
  tags: ['scenario', 'auth'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given('eve signs up', 'signsUpUser', {
      email: 'eve@example.com',
      password: 'mypassword',
    })
    const attempt = await scenario.when(
      'eve signs in and out again',
      'signsOutAndReadsSession',
      { email: 'eve@example.com', password: 'mypassword' }
    )
    await scenario.then('sees no session', 'expectsAuthAttempt', {
      attempt,
      accepted: true,
      sessionEmail: null,
    })
    return { signedOut: true }
  },
})

/**
 * The session read is a second HTTP request on the same cookie jar, so a
 * session that only lived in the sign-in response would not satisfy this.
 */
export const authSessionPersistsScenario = pikkuScenario<
  void,
  { persisted: true }
>({
  title: 'Session persists between requests',
  description: 'A later request on the same jar still reports the user',
  tags: ['scenario', 'auth'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given('frank signs up', 'signsUpUser', {
      email: 'frank@example.com',
      password: 'sessionpass',
    })
    const attempt = await scenario.when(
      'frank signs in and reads the session back',
      'signsInAndReadsSession',
      { email: 'frank@example.com', password: 'sessionpass' }
    )
    await scenario.then('sees frank on the session', 'expectsAuthAttempt', {
      attempt,
      accepted: true,
      sessionEmail: 'frank@example.com',
    })
    return { persisted: true }
  },
})

export const authSessionClearedAfterSignOutScenario = pikkuScenario<
  void,
  { cleared: true }
>({
  title: 'Session is cleared after logout',
  description: 'The session read after signing out is empty',
  tags: ['scenario', 'auth'],
  func: async (_services, _data, { scenario }) => {
    await scenario.given('grace signs up', 'signsUpUser', {
      email: 'grace@example.com',
      password: 'logouttest',
    })
    const attempt = await scenario.when(
      'grace signs in and out again',
      'signsOutAndReadsSession',
      { email: 'grace@example.com', password: 'logouttest' }
    )
    await scenario.then('sees an empty session', 'expectsAuthAttempt', {
      attempt,
      accepted: true,
      sessionEmail: null,
    })
    return { cleared: true }
  },
})

export const authFeature = pikkuFeature({
  name: 'Better Auth email/password authentication',
  description:
    'Sign-up, sign-in, sign-out and session reads through the real client SDK',
  tags: ['auth'],
  scenarios: [
    authSignUpSucceedsScenario,
    authDuplicateSignUpRejectedScenario,
    authSignInSucceedsScenario,
    authSignInWrongPasswordScenario,
    authSignInUnknownUserScenario,
    authSignOutScenario,
    authSessionPersistsScenario,
    authSessionClearedAfterSignOutScenario,
  ],
})
