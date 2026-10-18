export { defineSecret, SECRET_GENERATE_MIN_SIZE } from './secret.types.js'
export type {
  CoreSecret,
  OAuth2CredentialConfig,
  SecretGenerate,
  SecretDefinitionMeta,
  SecretDefinitionsMeta,
  SecretDefinitions,
} from './secret.types.js'
export { validateAndBuildSecretDefinitionsMeta } from './validate-secret-definitions.js'
export { deriveOAuth2AppSecrets } from './derive-oauth2-app-secrets.js'
