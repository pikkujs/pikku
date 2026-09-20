import { z } from 'zod'
import { defineSecret } from '#pikku/addon/secrets'

export const TypeSafeApiKey = z.string()

defineSecret({
  name: 'TYPESAFE_API_KEY',
  displayName: 'TypeSafe API key',
  description:
    "Authorises calls to TypeSafe System One. Its spend is billed by TypeSafe directly, not through this app's LLM provider.",
  secretId: 'TYPESAFE_API_KEY',
  schema: TypeSafeApiKey,
  docsUrl: 'https://console.typesafe.ai',
  allowedHosts: ['api.typesafe.ai'],
})
