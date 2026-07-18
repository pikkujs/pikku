import { wireSecret } from '@pikku/core/secret'
import { z } from 'zod'

export const FakeCrmApiKeySchema = z.string()

// A plain, non-OAuth secret the addon needs — surfaces in the requirements
// view as a "Set" action distinct from the OAuth "Connect" action.
wireSecret({
  name: 'fakeCrmApiKey',
  displayName: 'Fake CRM API Key',
  description: 'Server API key for the fake CRM',
  secretId: 'FAKE_CRM_API_KEY',
  schema: FakeCrmApiKeySchema,
})
