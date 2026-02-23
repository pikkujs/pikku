import { pikkuSessionlessFunc } from '#pikku'
import { OAuth2Client } from '@pikku/core/oauth2'

export const oauthExchangeTokens = pikkuSessionlessFunc<
  { code: string; state: string },
  { credentialName: string }
>({
  title: 'OAuth Exchange Tokens',
  description:
    'Given an authorization code and state string, retrieves the pending OAuth flow from oauthService using the state, creates an OAuth2Client, exchanges the code for tokens, stores the tokens in secrets service under the tokenSecretId, and returns the credentialName. Throws if the state is invalid or expired.',
  expose: true,
  func: async ({ logger, secrets, oauthService }, { code, state }) => {
    const flow = oauthService.getPendingFlow(state)
    if (!flow) {
      throw new Error('Invalid or expired OAuth state')
    }

    oauthService.removePendingFlow(state)

    const oauth2Client = new OAuth2Client(flow.oauth2, flow.secretId, secrets)

    const tokens = await oauth2Client.exchangeCode(code, flow.callbackUrl)

    await secrets.setSecretJSON(flow.oauth2.tokenSecretId, tokens)
    logger.info(
      `Tokens stored for '${flow.credentialName}' in secret '${flow.oauth2.tokenSecretId}'`
    )

    return { credentialName: flow.credentialName }
  },
})
