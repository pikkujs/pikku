import { wireAddon } from '#pikku/pikku-types.gen.js'

// A SECOND instance of @pikku/addon-mailgun (mailgun.addon.ts is the first).
// Two instances of one package must not share a secret, so this instance
// remaps the addon's MAILGUN_CREDENTIALS to its own project secret. Proves the
// instance-aware Setup tab: the console shows an instance selector and resolves
// each instance's secret name against its overrides.
wireAddon({
  name: 'mailgun-promo',
  package: '@pikku/addon-mailgun',
  secretOverrides: { MAILGUN_CREDENTIALS: 'MAILGUN_PROMO_CREDENTIALS' },
})
