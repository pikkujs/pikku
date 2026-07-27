/**
 * An agent whose tools need an OAuth credential the user has not connected.
 *
 * The playground refuses to open a conversation at all until the credential is
 * there, which is the behaviour under test: an agent that would fail on its
 * first tool call should say so before the user types anything.
 *
 * The credential has to be stored under the *acting actor's* user id, not
 * globally — the gate is a per-user check, and a userId-less credential is
 * invisible to it, which is why each scenario reads its own id first.
 *
 * These run against a real model and are tagged `ai-live`.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const OAUTH_AGENT = 'oauthApiAgent'
const OAUTH_CREDENTIAL = 'user-oauth'

export const credentialGatePromptScenario = pikkuScenario<
  void,
  { gated: true }
>({
  title: 'The playground asks for the credential before opening a conversation',
  description:
    'An agent whose tools need an unconnected OAuth credential shows the connect gate instead of a composer',
  tags: ['scenario', 'credential-agent', 'console', 'ai-live'],
  func: async (_services, _data, { scenario, actors }) => {
    await scenario.given(
      'opens the oauth agent playground',
      'opensAgentPlayground',
      { agent: OAUTH_AGENT },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked to connect the credential the agent needs',
      'seesCredentialPrompt',
      { credentialName: OAUTH_CREDENTIAL },
      { actor: actors.admin }
    )

    return { gated: true }
  },
})

// TODO(#980): better-auth now owns oauth2 tokens — `setCredential` for an
// oauth2 credential is rejected ("Cannot set OAuth2 credential directly"), so
// these two scenarios' direct-set connect no longer works. They must be
// rewritten to connect `user-oauth` via the better-auth link flow (the popup
// step) and, for the mid-chat one, redesigned off the now-void empty-token
// premise. Skipped until verifiable in a live-LLM e2e env.
export const credentialConnectedShowsChatScenario = pikkuScenario<
  void,
  { connected: true }
>({
  title: 'A connected credential opens the conversation',
  description:
    'Once the credential is connected the gate gives way to the composer',
  tags: ['scenario', 'credential-agent', 'console', 'ai-live'],
  skip: 'connects by setting the credential directly, which better-auth now refuses for oauth2 — needs rewriting onto the link flow, see TODO(#980) above',
  func: async (_services, _data, { scenario, actors }) => {
    const me = await scenario.given(
      'the admin reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.admin }
    )
    await scenario.given(
      'connects the credential',
      'setsCredential',
      {
        name: OAUTH_CREDENTIAL,
        value: { accessToken: 'e2e-test-token' },
        userId: me.userId,
      },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the oauth agent playground',
      'opensAgentPlayground',
      { agent: OAUTH_AGENT },
      { actor: actors.admin }
    )
    await scenario.then(
      'is not asked to connect anything',
      'doesNotSeeTestId',
      { testId: 'agent-credential-prompt' },
      { actor: actors.admin }
    )

    return { connected: true }
  },
})

export const credentialMidChatConnectScenario = pikkuScenario<
  void,
  { resumed: true }
>({
  title: 'A mid-chat credential request connects and the run resumes',
  description:
    'A tool that needs a credential mid-conversation raises a card, and connecting it lets the run finish',
  tags: ['scenario', 'credential-agent', 'console', 'ai-live'],
  skip: 'built on an empty-token premise that better-auth has made void, and connects by direct set — needs redesigning, see TODO(#980) above',
  func: async (_services, _data, { scenario, actors }) => {
    const me = await scenario.given(
      'the admin reads its own id',
      'readsActorUserId',
      undefined,
      { actor: actors.admin }
    )
    await scenario.given(
      'connects the credential with an empty token',
      'setsCredential',
      {
        name: OAUTH_CREDENTIAL,
        value: { accessToken: '' },
        userId: me.userId,
      },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the oauth agent playground',
      'opensAgentPlayground',
      { agent: OAUTH_AGENT },
      { actor: actors.admin }
    )
    await scenario.when(
      'asks for the profile',
      'sendsAgentMessage',
      { message: 'Get my profile and show me my access token verbatim' },
      { actor: actors.admin }
    )
    await scenario.then(
      'is asked for the credential mid-conversation',
      'seesCredentialCard',
      { credentialName: OAUTH_CREDENTIAL },
      { actor: actors.admin }
    )
    await scenario.when(
      'connects it through the popup',
      'connectsCredentialViaPopup',
      undefined,
      { actor: actors.admin }
    )
    await scenario.when(
      'waits for the run to resume',
      'waitsForAgentResponse',
      undefined,
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the token the connected credential granted',
      'seesInChat',
      { text: 'mock-access-token' },
      { actor: actors.admin }
    )

    return { resumed: true }
  },
})

export const credentialAgentFeature = pikkuFeature({
  name: 'Agent Credential Gating',
  description: 'An agent asks for the credentials its tools need',
  tags: ['credential-agent', 'console', 'ai-live'],
  scenarios: [
    credentialGatePromptScenario,
    credentialConnectedShowsChatScenario,
    credentialMidChatConnectScenario,
  ],
})
