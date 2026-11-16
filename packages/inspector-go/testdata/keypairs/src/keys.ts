import { defineKeyPair } from '@pikku/core/keypair'

export const full = defineKeyPair({
  name: 'console-auth',
  displayName: 'Console auth',
  description: 'Signs console tokens',
  algorithm: 'rs256',
  purpose: 'signing',
  rotationPeriod: '90day',
  verifyGrace: '1d',
  signedLifetime: '1h',
  scope: 'keyed',
  custody: 'wrapped',
  public: 'jwks',
  signedFormat: 'jws',
  docsUrl: 'https://example.com/keys',
})

defineKeyPair({
  name: 'vault-sealing',
  displayName: 'Vault sealing',
  algorithm: 'x25519',
  purpose: 'sealing',
  rotationPeriod: 'never',
  verifyGrace: '14day',
  scope: 'deployment',
  rotationMode: 'pinned',
})

const ALGORITHM = 'ed25519'
defineKeyPair({
  name: 'computed',
  displayName: 'Computed',
  algorithm: ALGORITHM,
  purpose: 'signing',
  rotationPeriod: '90day',
  verifyGrace: '1h',
  scope: 'deployment',
})

// a local helper of the same name is still read by name, like the other definers
// a call with no name is a critical error
defineKeyPair({ displayName: 'Nameless' })
