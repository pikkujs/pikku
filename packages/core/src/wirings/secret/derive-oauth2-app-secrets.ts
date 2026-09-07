import type { CredentialDefinitions } from '../credential/credential.types.js'
import type { SecretDefinitions } from './secret.types.js'

/**
 * The app secrets implied by the OAuth2 credentials a project declares.
 *
 * An OAuth2 credential always needs the app's client id and secret, and that
 * pair is the same shape every time — `OAuth2AppCredential`, which is what the
 * runtime reads it as and what the generated types already say it is. Making
 * every author restate it as a hand-written `defineSecret` bought nothing and
 * was silently skipped often enough that deployments were never asked for
 * credentials their connect flow needed.
 *
 * A declaration that already covers the secret id wins, so an author who wants
 * their own description or `docsUrl` keeps it.
 *
 * The derived secret is optional, matching what every hand-written declaration
 * chose: an addon that also authenticates by API key must still deploy without
 * an OAuth app configured.
 */
export const deriveOAuth2AppSecrets = (
  credentials: CredentialDefinitions,
  declared: SecretDefinitions
): SecretDefinitions => {
  const covered = new Set(declared.map((secret) => secret.secretId))
  const derived: SecretDefinitions = []

  for (const credential of credentials) {
    const { oauth2 } = credential
    if (!oauth2) continue
    if (covered.has(oauth2.appCredentialSecretId)) continue
    covered.add(oauth2.appCredentialSecretId)

    derived.push({
      name: `${credential.name}App`,
      displayName: `${credential.displayName} OAuth App`,
      description: `OAuth2 app client id and secret for ${credential.displayName}.`,
      secretId: oauth2.appCredentialSecretId,
      optional: true,
      docsUrl: credential.docsUrl,
      oauth2: {
        tokenSecretId: oauth2.tokenSecretId,
        authorizationUrl: oauth2.authorizationUrl,
        tokenUrl: oauth2.tokenUrl,
        scopes: oauth2.scopes,
        pkce: oauth2.pkce,
        additionalParams: oauth2.additionalParams,
      },
      sourceFile: credential.sourceFile,
    })
  }

  return derived
}
