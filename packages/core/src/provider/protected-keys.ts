/** Keys a provider may provide only by listing them in `replaces`. */
export const PROTECTED_KEYS: readonly string[] = [
  'secrets',
  'variables',
  'credentialService',
  'auth',
  'jwt',
  'logger',
]
