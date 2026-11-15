import { defineKeyPair } from '#pikku/keypairs/pikku-keypair-types.gen.js'

// @snippet start keyPairs
// Signs the receipts a shopper can verify later. The declaration holds no key
// material: the key service (`keyService`) creates, rotates and keeps the keys.
defineKeyPair({
  name: 'receipt-signing',
  displayName: 'Receipt signing',
  description: 'Signs order receipts',
  algorithm: 'ed25519',
  purpose: 'signing',
  signedLifetime: '1h',
  verifyGrace: '1day',
  rotationPeriod: '90day',
  scope: 'deployment',
})
// @snippet end keyPairs
