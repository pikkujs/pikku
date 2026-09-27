//~ name: wire-config
//~ title: Typed config — defineVariable (non-secret) + defineSecret (sensitive)
//~ when: The app needs a piece of real, app-specific config the brief calls for — a third-party API key, a configurable external URL/id. Do NOT invent config (there is NO ambient "app URL"); only wire what the brief actually needs.
import { z } from 'zod'
//~ defineVariable/defineSecret come from the generated '#pikku/variables' and
//~ '#pikku/secrets' leaves, like every other door an app reaches for. Declaring a
//~ wire makes its `name` a typed key on the injected variables/secrets service.
import { defineVariable } from '#pikku/variables'
import { defineSecret } from '#pikku/secrets'

//~ Each wire lives in its OWN *.config.ts file (co-locating wirings makes pikku
//~ SKIP them — "metadata not found"). `name` is the KEY you read by; `variableId`
//~ / `secretId` is the underlying store id (env var name / vault key). `schema`
//~ validates the value at load. Run pikku-verify after adding one so the typed
//~ variables/secrets map regenerates.

//~ NON-SECRET config (URLs, ids, feature flags) → defineVariable:
defineVariable({
  name: 'PARTNER_API_URL',
  displayName: 'Partner API URL',
  description: 'Base URL of the external partner API.',
  variableId: 'PARTNER_API_URL',
  schema: z.string().url(),
})

//~ SENSITIVE config (keys, tokens, passwords) → defineSecret. rotationPeriod is
//~ optional metadata ('30day', '1w') so consumers can tell when it's due.
defineSecret({
  name: 'PARTNER_API_KEY',
  displayName: 'Partner API key',
  description: 'Bearer key for the partner API.',
  secretId: 'PARTNER_API_KEY',
  schema: z.string().min(1),
  rotationPeriod: '90day',
})

//~ READ them in any function via the injected typed services — SINGULAR methods,
//~ which resolve the value type from the generated map. NEVER the plural
//~ getVariables/getSecrets with an inline type param (those return unknown):
//~   func: async ({ variables, secrets }, input) => {
//~     const url = await variables.get('PARTNER_API_URL')      // string
//~     // getSecret returns a SecretValue wrapper; .reveal() is the one way out
//~     const key = (await secrets.getSecret('PARTNER_API_KEY')).reveal()  // string
//~     // ...call the partner API with url + key
//~   }
